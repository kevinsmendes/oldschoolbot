import { calcWhatPercent, increaseNumByPercent, percentChance, reduceNumByPercent, Time } from 'e';
import { Bank } from 'oldschooljs';
import SimpleTable from 'oldschooljs/dist/structures/SimpleTable';

import { Activity, Emoji } from '../../constants';
import { allKalphiteKingItems, KalphiteKingMonster } from '../../kalphiteking';
import { addMonsterXP } from '../../minions/functions';
import announceLoot from '../../minions/functions/announceLoot';
import calculateMonsterFood from '../../minions/functions/calculateMonsterFood';
import { torvaOutfit } from '../../nex';
import { getUsersCurrentSlayerInfo } from '../../slayer/slayerUtil';
import { Gear } from '../../structures/Gear';
import { ItemBank } from '../../types';
import { ActivityTaskOptions, BossActivityTaskOptions } from '../../types/minions';
import { addBanks, noOp } from '../../util';
import calcDurQty from '../../util/calcMassDurationQuantity';
import { getKalphiteKingGearStats } from '../../util/getKalphiteKingGearStats';
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

const minimumSoloGear = new Gear({
	body: 'Torva platebody',
	legs: 'Torva platelegs',
	feet: 'Torva boots',
	hands: 'Torva gloves'
});

interface KalphiteKingUser {
	id: string;
	chanceOfDeath: number;
	damageDone: number;
}

export default class extends Default implements LfgInterface {
	activity: ActivityTaskOptions = <BossActivityTaskOptions>{ type: Activity.Nightmare };

	async HandleTripFinish(params: LfgHandleTripFinish): Promise<LfgHandleTripFinishReturn> {
		const { users, quantity, userID, duration } = <BossActivityTaskOptions>params.data;
		const { client } = params;

		let usersWithLoot: lfgReturnMessageInterface[] = [];
		let extraMessage = [];

		const teamsLoot: { [key: string]: ItemBank } = {};
		const kcAmounts: { [key: string]: number } = {};

		const parsedUsers: KalphiteKingUser[] = [];

		// For each user in the party, calculate their damage and death chance.
		for (const id of users) {
			const user = await client.users.fetch(id).catch(noOp);
			if (!user) continue;
			const [data] = getKalphiteKingGearStats(user, users);
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
			loot.add(KalphiteKingMonster.table.kill(1, {}));
			const winner = teamTable.roll()?.item;
			if (!winner) continue;
			const currentLoot = teamsLoot[winner];
			if (!currentLoot) teamsLoot[winner] = loot.bank;
			else teamsLoot[winner] = addBanks([currentLoot, loot.bank]);

			kcAmounts[winner] = Boolean(kcAmounts[winner]) ? ++kcAmounts[winner] : 1;
		}

		const leaderUser = await client.users.fetch(userID);

		const totalLoot = new Bank();

		let soloXP = '';

		for (let [userID, loot] of Object.entries(teamsLoot)) {
			const user = await client.users.fetch(userID).catch(noOp);
			if (!user) continue;
			totalLoot.add(loot);
			await user.addItemsToBank(loot, true);
			const kcToAdd = kcAmounts[user.id];
			if (kcToAdd) await user.incrementMonsterScore(KalphiteKingMonster.id, kcToAdd);
			const purple = Object.keys(loot).some(id => allKalphiteKingItems.includes(parseInt(id)));

			const usersTask = await getUsersCurrentSlayerInfo(user.id);
			const isOnTask =
				usersTask.assignedTask !== null &&
				usersTask.currentTask !== null &&
				usersTask.assignedTask.monsters.includes(KalphiteKingMonster.id);

			let xpStr = await addMonsterXP(user, {
				monsterID: KalphiteKingMonster.id,
				quantity: Math.ceil(quantity / users.length),
				duration,
				isOnTask,
				taskQuantity: quantity
			});
			if (isOnTask) {
				usersTask.currentTask!.quantityRemaining = Math.max(
					0,
					usersTask.currentTask!.quantityRemaining - quantity
				);
				await usersTask.currentTask!.save();
			}
			if (user.id === userID) {
				soloXP = xpStr;
			}

			usersWithLoot.push({ user, emoji: purple ? Emoji.Purple : false, lootedItems: new Bank(loot) });

			await announceLoot(client, leaderUser, KalphiteKingMonster, loot, {
				leader: leaderUser,
				lootRecipient: user,
				size: users.length
			});
		}

		if (users.length === 1) {
			extraMessage.push(
				`Your Kalphite King KC is now ${leaderUser.getKC(KalphiteKingMonster.id) + quantity}.\n\n${soloXP}`
			);
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

		const [hasReqs, reason] = params.user.hasMonsterRequirements(KalphiteKingMonster);
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

		if (params.solo) {
			if (!params.user.getGear('melee').meetsStatRequirements(minimumSoloGear.stats)) {
				returnMessage.push("Your gear isn't good enough to solo the Kalphite King.");
			}
			if (params.user.getKC(KalphiteKingMonster.id) < 10) {
				returnMessage.push('You need atleast 10 KC before you can solo the Kalphite King.');
			}
		}

		return returnMessage;
	}

	async getItemToRemoveFromBank(params: LfgGetItemToRemoveFromBank): Promise<Bank> {
		let [healAmountNeeded] = calculateMonsterFood(KalphiteKingMonster, params.user);
		const kc = params.user.getKC(KalphiteKingMonster.id);
		if (kc > 50) healAmountNeeded *= 0.5;
		else if (kc > 30) healAmountNeeded *= 0.6;
		else if (kc > 15) healAmountNeeded *= 0.7;
		else if (kc > 10) healAmountNeeded *= 0.8;
		else if (kc > 5) healAmountNeeded *= 0.9;
		healAmountNeeded /= (params.party.length + 1) / 1.5;
		let brewsNeeded = Math.ceil(healAmountNeeded / 16) * params.quantity;
		if (params.party.length === 1) brewsNeeded += 2;
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

		let effectiveTime = KalphiteKingMonster!.timeToFinish;

		const messages = [];

		for (const user of party) {
			const [data] = getKalphiteKingGearStats(
				user,
				party.map(u => u.id)
			);

			let msgs = [];

			// Special inquisitor outfit damage boost
			const meleeGear = user.getGear('melee');
			const equippedWeapon = meleeGear.equippedWeapon();
			if (meleeGear.hasEquipped(torvaOutfit, true)) {
				const percent = 8;
				effectiveTime = reduceNumByPercent(effectiveTime, percent);
				msgs.push(`${percent}% boost for full Torva`);
			} else {
				let i = 0;
				for (const inqItem of torvaOutfit) {
					if (meleeGear.hasEquipped([inqItem])) {
						const percent = 1;
						i += percent;
					}
				}
				if (i > 0) {
					msgs.push(`${i}% boost for Torva items`);
					effectiveTime = reduceNumByPercent(effectiveTime, i);
				}
			}

			if (data.gearStats.attack_crush < 200) {
				const percent = 10;
				effectiveTime = increaseNumByPercent(effectiveTime, percent);
				msgs.push(`-${percent}% penalty for 140 attack crush`);
			}

			if (!equippedWeapon || !equippedWeapon.equipment || equippedWeapon.equipment.attack_crush < 95) {
				const percent = 30;
				effectiveTime = increaseNumByPercent(effectiveTime, percent);
				msgs.push(`-${percent}% penalty for bad weapon`);
			}

			if (meleeGear.hasEquipped('Drygore mace')) {
				const percent = 14;
				effectiveTime = reduceNumByPercent(effectiveTime, percent);
				msgs.push(`${percent}% boost for Drygore mace`);
			}

			if (meleeGear.hasEquipped('Offhand drygore mace')) {
				const percent = 5;
				effectiveTime = reduceNumByPercent(effectiveTime, percent);
				msgs.push(`${percent}% boost for Offhand drygore mace`);
			}

			// Increase duration for lower melee-strength gear.
			let rangeStrBonus = 0;
			if (data.percentAttackStrength < 40) {
				rangeStrBonus = 6;
			} else if (data.percentAttackStrength < 50) {
				rangeStrBonus = 3;
			} else if (data.percentAttackStrength < 60) {
				rangeStrBonus = 2;
			}
			if (rangeStrBonus !== 0) {
				effectiveTime = increaseNumByPercent(effectiveTime, rangeStrBonus);
				msgs.push(`-${rangeStrBonus}% penalty for ${data.percentAttackStrength}% attack strength`);
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

			messages.push(`**${user.username}**: ${msgs.join(', ')}`);
		}

		if (party.length === 1) {
			effectiveTime = reduceNumByPercent(effectiveTime, 20);
		}

		let [quantity, duration, perKillTime, calcMessages] = await calcDurQty(
			party,
			{ ...KalphiteKingMonster, timeToFinish: effectiveTime },
			undefined,
			Time.Minute * 2,
			Time.Minute * 30
		);

		if (calcMessages && calcMessages.length > 0) {
			messages.push(...calcMessages);
		}

		return {
			activitiesThisTrip: quantity,
			durationOfTrip: duration,
			timePerActivity: perKillTime,
			extraMessages: messages
		};
	}
}
