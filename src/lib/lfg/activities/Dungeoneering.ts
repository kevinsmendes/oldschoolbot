import { increaseNumByPercent, noOp, objectEntries, reduceNumByPercent, Time } from 'e';
import { KlasaUser } from 'klasa';
import { Bank } from 'oldschooljs';

import { DungeoneeringOptions, maxFloorUserCanDo } from '../../../commands/Minion/dung';
import { Activity, Emoji } from '../../constants';
import { getRandomMysteryBox } from '../../data/openables';
import { UserSettings } from '../../settings/types/UserSettings';
import Skills from '../../skilling/skills';
import { SkillsEnum } from '../../skilling/types';
import { ActivityTaskOptions, GroupMonsterActivityTaskOptions } from '../../types/minions';
import { convertXPtoLVL, randomVariation, roll, toKMB } from '../../util';
import itemID from '../../util/itemID';
import resolveItems from '../../util/resolveItems';
import LfgInterface, {
	LfgCalculateDurationAndActivitiesPerTrip,
	LfgCalculateDurationAndActivitiesPerTripReturn,
	LfgCheckUserRequirements,
	LfgHandleTripFinish,
	LfgHandleTripFinishReturn,
	lfgReturnMessageInterface
} from '../LfgInterface';

export enum DungeoneeringFloorIds {
	Floor1 = 777_333_001,
	Floor2 = 777_333_002,
	Floor3 = 777_333_003,
	Floor4 = 777_333_004,
	Floor5 = 777_333_005,
	Floor6 = 777_333_006,
	Floor7 = 777_333_007
}

export const gorajanWarriorOutfit = resolveItems([
	'Gorajan warrior helmet',
	'Gorajan warrior top',
	'Gorajan warrior legs',
	'Gorajan warrior gloves',
	'Gorajan warrior boots'
]);
export const gorajanOccultOutfit = resolveItems([
	'Gorajan occult helmet',
	'Gorajan occult top',
	'Gorajan occult legs',
	'Gorajan occult gloves',
	'Gorajan occult boots'
]);
export const gorajanArcherOutfit = resolveItems([
	'Gorajan archer helmet',
	'Gorajan archer top',
	'Gorajan archer legs',
	'Gorajan archer gloves',
	'Gorajan archer boots'
]);
const data = [
	[gorajanWarriorOutfit, 'melee'],
	[gorajanOccultOutfit, 'mage'],
	[gorajanArcherOutfit, 'range']
] as const;

export default class implements LfgInterface {
	activity: ActivityTaskOptions = <DungeoneeringOptions>{ type: Activity.Dungeoneering };

	numberOfGorajanOutfitsEquipped(user: KlasaUser) {
		let num = 0;
		for (const outfit of data) {
			if (user.getGear(outfit[1]).hasEquipped(outfit[0], true)) num++;
		}
		return num;
	}

	determineDgLevelForFloor(floor: number) {
		return Math.floor(floor * 20 - 20);
	}

	requiredSkills(floor: number) {
		const lvl = floor * 14;
		const nonCmbLvl = Math.floor(lvl / 1.5);
		return {
			attack: lvl,
			strength: lvl,
			defence: lvl,
			hitpoints: lvl,
			magic: lvl,
			ranged: lvl,
			herblore: nonCmbLvl,
			runecraft: nonCmbLvl,
			prayer: nonCmbLvl,
			fletching: nonCmbLvl,
			fishing: nonCmbLvl,
			cooking: nonCmbLvl,
			construction: nonCmbLvl,
			crafting: nonCmbLvl,
			dungeoneering: this.determineDgLevelForFloor(floor)
		};
	}

	maxFloorUserCanDo(user: KlasaUser) {
		return [7, 6, 5, 4, 3, 2, 1].find(floor => this.hasRequiredLevels(user, floor).length === 0) || 1;
	}

	hasRequiredLevels(user: KlasaUser, floor: number): string[] {
		const skillsMissing: string[] = [];
		const requirements = this.requiredSkills(floor);
		const userSkills = user.rawSkills;
		for (const [skillName, skillLevel] of objectEntries(requirements)) {
			const userLevel = convertXPtoLVL(userSkills[skillName] ?? 1, 120);
			if (userLevel < skillLevel) {
				const skill = Object.values(Skills).find(s => s.id === skillName)!;
				skillsMissing.push(`${skill.emoji} **${skill.name}**: ${skillLevel}`);
			}
		}
		return skillsMissing;
	}

	returnBestQueueForUser(user: KlasaUser) {
		const floor = `Floor${this.maxFloorUserCanDo(user)}`;
		return DungeoneeringFloorIds[floor as keyof typeof DungeoneeringFloorIds];
	}

	async HandleTripFinish(params: LfgHandleTripFinish): Promise<LfgHandleTripFinishReturn> {
		const { quantity, users, duration } = <GroupMonsterActivityTaskOptions>params.data;
		const { client } = params;
		const { floor } = params.queue.extraParams!;

		let usersWithLoot: lfgReturnMessageInterface[] = [];
		let extraMessage = [];

		console.log(Boolean(client), Boolean(quantity), Boolean(users));

		let baseXp = ((Math.log(floor * 16 + 1) * quantity) / (36 - floor * 5)) * 59_000 * 1.5;
		const minutes = duration / Time.Minute;

		// Get the highest dungeon level of the party and check if anyone has a Dungeoneering Master Cape equipped
		const klasaUsers: KlasaUser[] = [];
		let hasDgMasterCape = false;
		let highestPartyLevel = 0;
		for (const id of users) {
			const u = await client.users.fetch(id).catch(noOp);
			if (!u) continue;
			const userDgLevel = u.skillLevel(SkillsEnum.Dungeoneering);
			if (!hasDgMasterCape && u.hasItemEquippedAnywhere('Dungeoneering master cape')) {
				hasDgMasterCape = true;
			}
			if (userDgLevel > highestPartyLevel) highestPartyLevel = userDgLevel;
			klasaUsers.push(u);
		}

		for (const u of klasaUsers) {
			let xp = Math.floor(randomVariation((baseXp * u.skillLevel(SkillsEnum.Dungeoneering)) / 120, 5));
			const maxFloor = maxFloorUserCanDo(u);
			xp = reduceNumByPercent(xp, (maxFloor - floor) * 5);

			if (floor === maxFloor) {
				xp *= 1.5;
			}

			const tokens = Math.floor((xp * 0.1) / 4);
			const gorajanEquipped = this.numberOfGorajanOutfitsEquipped(u);
			let bonusXP = 0;
			if (gorajanEquipped > 0) {
				bonusXP += Math.floor(xp * (gorajanEquipped / 2));
				xp += bonusXP;
			}
			await u.addXP({
				skillName: SkillsEnum.Dungeoneering,
				amount: xp / 5,
				duration
			});
			await u.settings.update(
				UserSettings.DungeoneeringTokens,
				u.settings.get(UserSettings.DungeoneeringTokens) + tokens
			);
			let rawXPHr = (xp / (duration / Time.Minute)) * 60;
			rawXPHr = Math.floor(xp / 1000) * 1000;

			const userLoot = new Bank();

			const gotMysteryBox = u.bank().has('Scroll of mystery') && roll(5);
			if (gotMysteryBox) {
				const mysteryBox = getRandomMysteryBox();
				await u.addItemsToBank({ [mysteryBox]: 1 });
				userLoot.add(mysteryBox);
			}

			extraMessage.push(
				`${gotMysteryBox ? Emoji.MysteryBox : ''} ${u.username} received ${xp.toLocaleString()} XP (${toKMB(
					rawXPHr
				)}/hr)${gorajanEquipped > 0 ? ` + ${bonusXP.toLocaleString()} Bonus XP` : ''} and ${toKMB(
					(rawXPHr * 0.1) / 4
				)} tokens/hr`
			);

			const shardChance = hasDgMasterCape ? 500 : highestPartyLevel >= 99 ? 1200 : 2000;
			if (floor >= 5 && roll(Math.floor(shardChance / minutes))) {
				await u.addItemsToBank(new Bank().add('Gorajan shards'), true);
				userLoot.add('Gorajan shards');
			}
			if (floor === 7 && roll(Math.floor(20_000 / minutes))) {
				await u.addItemsToBank(new Bank().add('Gorajan bonecrusher (u)'), true);
				userLoot.add('Gorajan bonecrusher (u)');
			}
			usersWithLoot.push({
				user: u,
				emoji: false,
				lootedItems: userLoot,
				lootedNonItems: { 'Dungeoneering Tokens': tokens },
				spoiler: false
			});
		}

		return { usersWithLoot, extraMessage };
	}

	async calculateDurationAndActivitiesPerTrip(
		params: LfgCalculateDurationAndActivitiesPerTrip
	): Promise<LfgCalculateDurationAndActivitiesPerTripReturn> {
		const dungeonLength = Time.Minute * 5 * (params.queue.extraParams!.floor / 2);
		const quantity = Math.floor(params.leader.maxTripLength(Activity.Dungeoneering) / dungeonLength);
		let duration = quantity * dungeonLength;
		const boosts: string[] = [];
		for (const user of params.party) {
			if (await user.hasItem(itemID('Scroll of teleportation'))) {
				let userPercentReduction = 15;
				if (user.hasItemEquippedOrInBank('Dungeoneering master cape')) {
					userPercentReduction += 10;
				} else if (
					user.hasItemEquippedOrInBank('Dungeoneering cape') ||
					user.hasItemEquippedOrInBank('Dungeoneering cape(t)')
				) {
					userPercentReduction += 5;
				}

				const percentualReduction = userPercentReduction / params.party.length;
				duration = reduceNumByPercent(duration, percentualReduction);
				boosts.push(`${percentualReduction.toFixed(2)}% from ${user.username}`);
			}
			const numGora = this.numberOfGorajanOutfitsEquipped(user);
			if (numGora > 0) {
				let x = (numGora * 6) / params.party.length;
				duration = reduceNumByPercent(duration, x);
				boosts.push(`${x.toFixed(2)}% from ${user.username}'s Gorajan`);
			}
		}

		duration = reduceNumByPercent(duration, 20);
		if (params.party.length === 1) {
			duration = increaseNumByPercent(duration, 20);
			boosts.push('-20% for not having a team');
		} else if (params.party.length === 2) {
			duration = increaseNumByPercent(duration, 15);
			boosts.push('-15% for having a small team');
		}

		return {
			activitiesThisTrip: quantity,
			durationOfTrip: duration,
			timePerActivity: dungeonLength,
			extraMessages: boosts
		};
	}

	async checkUserRequirements(params: LfgCheckUserRequirements): Promise<string[]> {
		let returnMessage: string[] = [];

		if (!params.user.hasMinion) {
			returnMessage.push('You need a minion to join this activity!');
		}

		if (params.user.minionIsBusy) {
			returnMessage.push("You are busy right now and can't join this queue!");
		}

		const requiredLevels = this.hasRequiredLevels(params.user, params.queue.extraParams!.floor);
		if (requiredLevels.length > 0) {
			returnMessage.push(
				`You don't meet the requirement levels for this floor. You are missing: ${requiredLevels.join(', ')}`
			);
		}

		return returnMessage;
	}

	async getItemToRemoveFromBank(): Promise<Bank> {
		return new Bank();
	}

	checkTeamRequirements(): string[] {
		return [];
	}
}
