import { calcWhatPercent, increaseNumByPercent, percentChance, reduceNumByPercent } from 'e';
import { Bank } from 'oldschooljs';
import SimpleTable from 'oldschooljs/dist/structures/SimpleTable';

import { production } from '../../../config';
import { Activity, Emoji, Time } from '../../constants';
import { addMonsterXP } from '../../minions/functions';
import announceLoot from '../../minions/functions/announceLoot';
import calculateMonsterFood from '../../minions/functions/calculateMonsterFood';
import { allNexItems, NexMonster, pernixOutfit } from '../../nex';
import { UserSettings } from '../../settings/types/UserSettings';
import { ItemBank } from '../../types';
import { ActivityTaskOptions, BossActivityTaskOptions } from '../../types/minions';
import { addBanks, itemID, noOp, randomItemFromArray, roll } from '../../util';
import calcDurQty from '../../util/calcMassDurationQuantity';
import { getNexGearStats } from '../../util/getNexGearStats';
import LfgInterface, {
	LfgCalculateDurationAndActivitiesPerTrip,
	LfgCalculateDurationAndActivitiesPerTripReturn,
	LfgCheckUserRequirements,
	LfgGetItemToRemoveFromBank,
	LfgHandleTripFinish,
	LfgHandleTripFinishReturn,
	lfgReturnMessageInterface
} from '../LfgInterface';
import Default from './Default';

interface NexUser {
	id: string;
	chanceOfDeath: number;
	damageDone: number;
}

export default class extends Default implements LfgInterface {
	activity: ActivityTaskOptions = <BossActivityTaskOptions>{ type: Activity.Nex };

	async HandleTripFinish(params: LfgHandleTripFinish): Promise<LfgHandleTripFinishReturn> {
		const { users, quantity, userID, duration } = <BossActivityTaskOptions>params.data;
		const { client } = params;

		let usersWithLoot: lfgReturnMessageInterface[] = [];
		let extraMessage = [];

		const teamsLoot: { [key: string]: ItemBank } = {};
		const kcAmounts: { [key: string]: number } = {};

		const parsedUsers: NexUser[] = [];

		// For each user in the party, calculate their damage and death chance.
		for (const id of users) {
			const user = await client.users.fetch(id).catch(noOp);
			if (!user) continue;
			const [data] = getNexGearStats(user, users);
			parsedUsers.push({ ...data, id: user.id });
		}

		// Store total amount of deaths
		const deaths: Record<string, number> = {};

		for (let i = 0; i < quantity; i++) {
			const teamTable = new SimpleTable<string>();

			let teamFailed = false;
			for (const user of parsedUsers.sort((a, b) => b.chanceOfDeath - a.chanceOfDeath)) {
				const currentDeaths = Object.keys(deaths).length;
				if (calcWhatPercent(currentDeaths, users.length) >= 50) {
					// If over 50% of the team died, the entire team dies.
					teamFailed = true;
				}

				if (teamFailed || percentChance(user.chanceOfDeath)) {
					deaths[user.id] = Boolean(deaths[user.id]) ? deaths[user.id] + 1 : 1;
				} else {
					// weight on damagedone
					teamTable.add(user.id, user.damageDone);
				}
			}

			const loot = new Bank();
			loot.add(NexMonster.table.kill(1, {}));
			if (roll(80 + users.length * 2)) {
				loot.add(randomItemFromArray(allNexItems), 1);
			}
			const winner = teamTable.roll()?.item;
			if (!winner) continue;
			const currentLoot = teamsLoot[winner];
			if (!currentLoot) teamsLoot[winner] = loot.bank;
			else teamsLoot[winner] = addBanks([currentLoot, loot.bank]);

			kcAmounts[winner] = Boolean(kcAmounts[winner]) ? ++kcAmounts[winner] : 1;
		}

		const leaderUser = await client.users.fetch(userID);

		const totalLoot = new Bank();

		for (let [userID, loot] of Object.entries(teamsLoot)) {
			const user = await client.users.fetch(userID).catch(noOp);
			if (!user) continue;
			if (kcAmounts[user.id]) {
				await addMonsterXP(user, {
					monsterID: 46274,
					quantity: Math.ceil(quantity / users.length),
					duration,
					isOnTask: false,
					taskQuantity: null
				});
			}
			totalLoot.add(loot);
			await user.addItemsToBank(loot, true);
			const kcToAdd = kcAmounts[user.id];
			if (kcToAdd) await user.incrementMonsterScore(NexMonster.id, kcToAdd);
			const purple = Object.keys(loot).some(id => allNexItems.includes(parseInt(id)));

			usersWithLoot.push({ user, emoji: purple ? Emoji.Purple : false, lootedItems: new Bank(loot) });

			await announceLoot(client, leaderUser, NexMonster, loot, {
				leader: leaderUser,
				lootRecipient: user,
				size: users.length
			});
		}

		// Show deaths in the result
		const deathEntries = Object.entries(deaths);
		if (deathEntries.length > 0) {
			const deaths = [];
			for (const [id, qty] of deathEntries) {
				const user = await client.users.fetch(id).catch(noOp);
				if (!user) continue;
				deaths.push(`**${user.username}**: ${qty}x`);
			}
			extraMessage.push(`**Deaths**: ${deaths.join(', ')}.`);
		}

		if (production) {
			extraMessage.push(`\`\`\`\n${JSON.stringify([parsedUsers, deaths], null, 4)}\n\`\`\``);
		}

		const usersWithoutLoot = users.filter(id => !teamsLoot[id]);

		return { usersWithLoot, usersWithoutLoot, extraMessage };
	}

	async checkUserRequirements(params: LfgCheckUserRequirements): Promise<string[]> {
		let returnMessage: string[] = [];

		if (!params.user.hasMinion) {
			returnMessage.push("You do not have a minion and so, can't join this activity!");
		}

		if (params.user.minionIsBusy) {
			returnMessage.push("You are busy right now and can't join this activity!");
		}

		if (!params.user.bank().has('Frozen key')) {
			returnMessage.push('A frozen key is required to combat Nex!');
		}

		const [hasReqs, reason] = params.user.hasMonsterRequirements(params.queue.monster!);
		if (!hasReqs) {
			returnMessage.push(`You don't meet the requirements for this activity: ${reason}`);
		}

		const itemCost = await this.getItemToRemoveFromBank({
			party: params.party,
			quantity: params.quantity,
			queue: params.queue,
			solo: params.solo,
			user: params.user
		});
		if (!params.user.owns(itemCost)) {
			const missingItems = itemCost.remove(params.user.bank({ withGP: true }));
			returnMessage.push(
				`You don't have enough items for this activity. You are missing the following items: ${missingItems}`
			);
		}

		return returnMessage;
	}

	async getItemToRemoveFromBank(params: LfgGetItemToRemoveFromBank): Promise<Bank> {
		let [healAmountNeeded] = calculateMonsterFood(NexMonster, params.user);
		const kc = params.user.settings.get(UserSettings.MonsterScores)[NexMonster.id] ?? 0;
		if (kc > 50) healAmountNeeded *= 0.5;
		else if (kc > 30) healAmountNeeded *= 0.6;
		else if (kc > 15) healAmountNeeded *= 0.7;
		else if (kc > 10) healAmountNeeded *= 0.8;
		else if (kc > 5) healAmountNeeded *= 0.9;
		if (params.party.length > 1) {
			healAmountNeeded /= (params.party.length + 1) / 1.5;
		}
		const brewsNeeded = Math.ceil(healAmountNeeded / 16) * params.quantity;
		const restoresNeeded = Math.ceil(brewsNeeded / 3);
		return new Bank({
			'Saradomin brew(4)': brewsNeeded,
			'Super restore(4)': restoresNeeded
		});
	}

	async calculateDurationAndActivitiesPerTrip(
		params: LfgCalculateDurationAndActivitiesPerTrip
	): Promise<LfgCalculateDurationAndActivitiesPerTripReturn> {
		const { party } = params;
		let debugStr = '';

		let effectiveTime = NexMonster.timeToFinish;
		const isSolo = party.length === 1;

		if (isSolo && (party[0].settings.get(UserSettings.MonsterScores)[NexMonster.id] ?? 0) < 200) {
			effectiveTime = increaseNumByPercent(effectiveTime, 20);
		}

		if (isSolo && (party[0].settings.get(UserSettings.MonsterScores)[NexMonster.id] ?? 0) > 500) {
			effectiveTime = reduceNumByPercent(effectiveTime, 20);
		}

		for (const user of party) {
			const [data] = getNexGearStats(
				user,
				party.map(u => u.id)
			);
			debugStr += `**${user.username}**: `;
			let msgs = [];

			// Special inquisitor outfit damage boost
			const rangeGear = user.getGear('range');
			const equippedWeapon = rangeGear.equippedWeapon();
			if (rangeGear.hasEquipped(pernixOutfit, true)) {
				const percent = isSolo ? 20 : 8;
				effectiveTime = reduceNumByPercent(effectiveTime, percent);
				msgs.push(`${percent}% boost for full pernix`);
			} else {
				let i = 0;
				for (const inqItem of pernixOutfit) {
					if (rangeGear.hasEquipped([inqItem])) {
						const percent = isSolo ? 2.4 : 1;
						i += percent;
					}
				}
				if (i > 0) {
					msgs.push(`${i}% boost for pernix items`);
					effectiveTime = reduceNumByPercent(effectiveTime, i);
				}
			}

			if (data.gearStats.attack_ranged < 200) {
				const percent = isSolo ? 20 : 10;
				effectiveTime = increaseNumByPercent(effectiveTime, percent);
				msgs.push(`-${percent}% penalty for <200 ranged attack`);
			}

			if (equippedWeapon?.id === itemID('Twisted bow')) {
				const percent = isSolo ? 15 : 9;
				effectiveTime = reduceNumByPercent(effectiveTime, percent);
				msgs.push(`${percent}% boost for Twisted bow`);
			} else if (equippedWeapon?.id === itemID('Zaryte bow')) {
				const percent = isSolo ? 20 : 14;
				effectiveTime = reduceNumByPercent(effectiveTime, percent);
				msgs.push(`${percent}% boost for Zaryte bow`);
			}

			// Increase duration for lower melee-strength gear.
			let rangeStrBonus = 0;
			if (data.percentRangeStrength < 40) {
				rangeStrBonus = 6;
			} else if (data.percentRangeStrength < 50) {
				rangeStrBonus = 3;
			} else if (data.percentRangeStrength < 60) {
				rangeStrBonus = 2;
			}
			if (rangeStrBonus !== 0) {
				effectiveTime = increaseNumByPercent(effectiveTime, rangeStrBonus);
				msgs.push(`-${rangeStrBonus}% penalty for ${data.percentRangeStrength}% range strength`);
			}

			// Increase duration for lower KC.
			let kcBonus = -4;
			if (data.kc < 10) {
				kcBonus = 15;
			} else if (data.kc < 25) {
				kcBonus = 5;
			} else if (data.kc < 50) {
				kcBonus = 2;
			} else if (data.kc < 100) {
				kcBonus = -2;
			}

			if (kcBonus < 0) {
				effectiveTime = reduceNumByPercent(effectiveTime, Math.abs(kcBonus));
				msgs.push(`${Math.abs(kcBonus)}% boost for KC`);
			} else {
				effectiveTime = increaseNumByPercent(effectiveTime, kcBonus);
				msgs.push(`-${kcBonus}% penalty for KC`);
			}

			if (data.kc > 500) {
				effectiveTime = reduceNumByPercent(effectiveTime, 15);
				msgs.push(`15% for ${user.username} over 500 kc`);
			} else if (data.kc > 300) {
				effectiveTime = reduceNumByPercent(effectiveTime, 13);
				msgs.push(`13% for ${user.username} over 300 kc`);
			} else if (data.kc > 200) {
				effectiveTime = reduceNumByPercent(effectiveTime, 10);
				msgs.push(`10% for ${user.username} over 200 kc`);
			} else if (data.kc > 100) {
				effectiveTime = reduceNumByPercent(effectiveTime, 7);
				msgs.push(`7% for ${user.username} over 100 kc`);
			} else if (data.kc > 50) {
				effectiveTime = reduceNumByPercent(effectiveTime, 5);
				msgs.push(`5% for ${user.username} over 50 kc`);
			}

			debugStr += `${msgs.join(', ')}. `;
		}

		let [quantity, duration, perKillTime] = await calcDurQty(
			party,
			{ ...NexMonster, timeToFinish: effectiveTime },
			undefined,
			Time.Minute * 2,
			Time.Minute * 30
		);

		return {
			activitiesThisTrip: quantity,
			durationOfTrip: duration,
			timePerActivity: perKillTime,
			extraMessages: [debugStr]
		};
	}
}
