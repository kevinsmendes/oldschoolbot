import { calcPercentOfNum, calcWhatPercent, randFloat, reduceNumByPercent, sumArr } from 'e';
import { KlasaUser } from 'klasa';
import { Bank } from 'oldschooljs';

import { GearSetupTypes, GearStats } from '../../../gear';
import { Gear } from '../../../structures/Gear';
import { Skills } from '../../../types';
import { ActivityTaskOptions, BossActivityTaskOptions } from '../../../types/minions';
import LfgInterface, {
	LfgCalculateDurationAndActivitiesPerTrip,
	LfgCalculateDurationAndActivitiesPerTripReturn,
	LfgCheckUserRequirements,
	LfgGetItemToRemoveFromBank,
	LfgHandleTripFinish,
	LfgHandleTripFinishReturn
} from '../../LfgInterface';

export interface BossUser {
	user: KlasaUser;
	userPercentChange: number;
	deathChance: number;
	debugStr: string;
}

interface BossOptions {
	baseDuration: number;
	baseFoodRequired: number;
	skillRequirements: Skills;
	itemBoosts: [string, number][];
	bisGear: Gear;
	gearSetup: GearSetupTypes;
	itemCost?: (user: KlasaUser) => Promise<Bank>;
	mostImportantStat: keyof GearStats;
	food: Bank | ((user: KlasaUser) => Bank);
	canDie: boolean;
	kcLearningCap?: number;
}

export interface BossUser {
	user: KlasaUser;
	userPercentChange: number;
	deathChance: number;
	debugStr: string;
}

export const gpCostPerKill = (user: KlasaUser) =>
	user.getGear('melee').hasEquipped(['Ring of charos', 'Ring of charos(a)'], false) ? 5_000_000 : 10_000_000;

export const calcDwwhChance = (users: KlasaUser[]) => {
	const size = Math.min(users.length, 10);
	const baseRate = 850;
	const modDenominator = 15;

	let dropRate = (baseRate / 2) * (1 + size / modDenominator);
	let groupRate = Math.ceil(dropRate / size);
	groupRate = Math.ceil(groupRate);

	if (users.some(u => u.getGear('melee').hasEquipped('Ring of luck'))) {
		groupRate = Math.floor(reduceNumByPercent(groupRate, 15));
	}
	return groupRate;
};

function teamSizeBoostPercent(size: number) {
	switch (size) {
		case 1:
			return -5;
		case 2:
			return 15;
		case 3:
			return 19;
		case 4:
			return 21;
		case 5:
			return 23;
		case 6:
			return 26;
		case 7:
			return 29;
		default:
			return 31;
	}
}

export function calcFood(solo: boolean, kc: number) {
	const items = new Bank();

	let brewsNeeded = Math.max(1, 8 - Math.max(1, Math.ceil((kc + 1) / 30)));
	if (solo) brewsNeeded += 2;
	const restoresNeeded = Math.max(1, Math.floor(brewsNeeded / 3));

	items.add('Saradomin brew(4)', brewsNeeded + 1);
	items.add('Super restore(4)', restoresNeeded);
	return items;
}

function calcSetupPercent(
	maxGear: Gear,
	userGear: Gear,
	heavyPenalizeStat: keyof GearStats,
	ignoreStats: (keyof GearStats)[]
) {
	const maxStats = maxGear.stats;
	const userStats = userGear.stats;
	let numKeys = 0;
	let totalPercent = 0;

	for (const [key, val] of Object.entries(maxStats) as [keyof GearStats, number][]) {
		if (val <= 0 || ignoreStats.includes(key)) continue;
		const rawPercent = Math.min(100, calcWhatPercent(userStats[key], val));
		totalPercent += rawPercent;
		numKeys++;
	}

	totalPercent /= numKeys;

	// Heavy penalize for having less than 50% in the main stat of this setup.
	if (userStats[heavyPenalizeStat] < maxStats[heavyPenalizeStat] / 2) {
		totalPercent = Math.floor(Math.max(0, totalPercent / 2));
	}

	if (isNaN(totalPercent) || totalPercent < 0 || totalPercent > 100) {
		throw new Error('Invalid total gear percent.');
	}

	return totalPercent;
}

export default class implements LfgInterface {
	baseDuration: number;
	skillRequirements: Skills;
	itemBoosts: [string, number][];
	bisGear: Gear;
	gearSetup: GearSetupTypes;
	itemCost?: (user: KlasaUser) => Promise<Bank>;
	mostImportantStat: keyof GearStats;
	food: Bank | ((user: KlasaUser) => Bank);
	bossUsers: BossUser[] = [];
	duration: number = -1;
	totalPercent: number = -1;
	canDie: boolean;
	kcLearningCap: number;

	activity: ActivityTaskOptions = <BossActivityTaskOptions>{};

	constructor(options: BossOptions) {
		this.baseDuration = options.baseDuration;
		this.skillRequirements = options.skillRequirements;
		this.itemBoosts = options.itemBoosts;
		this.bisGear = options.bisGear;
		this.gearSetup = options.gearSetup;
		this.itemCost = options.itemCost;
		this.mostImportantStat = options.mostImportantStat;
		this.food = options.food;
		this.canDie = options.canDie;
		this.kcLearningCap = options.kcLearningCap ?? 250;
	}

	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	async HandleTripFinish(params: LfgHandleTripFinish): Promise<LfgHandleTripFinishReturn> {
		throw 'Method not implemented!';
	}

	async calculateDurationAndActivitiesPerTrip(
		params: LfgCalculateDurationAndActivitiesPerTrip
	): Promise<LfgCalculateDurationAndActivitiesPerTripReturn> {
		const { queue } = params;
		const monsterID = queue.monster!.id;

		const maxReduction = 40;
		const speedReductionForGear = 25;
		const speedReductionForKC = 35;
		let speedReductionForBoosts = sumArr(this.itemBoosts.map(i => i[1]));
		const totalSpeedReduction = speedReductionForGear + speedReductionForKC + speedReductionForBoosts;

		const bossUsers: BossUser[] = [];
		let totalPercent = 0;

		// Track user len outside the loop because the loop corrupts it. (calcFoodForUser())
		for (const user of params.party) {
			const gear = user.getGear(this.gearSetup);
			let debugStr = [];
			let userPercentChange = 0;

			// Gear
			const gearPercent = calcSetupPercent(this.bisGear, gear, this.mostImportantStat, []);
			const gearBoostPercent = calcPercentOfNum(gearPercent, speedReductionForGear);
			userPercentChange += gearBoostPercent;
			debugStr.push(`**Gear**[${gearPercent.toFixed(1)}%]`);

			// KC
			const kc = user.getKC(monsterID);
			const kcPercent = Math.min(100, calcWhatPercent(kc, this.kcLearningCap));
			const kcBoostPercent = calcPercentOfNum(kcPercent, speedReductionForKC);
			userPercentChange += kcBoostPercent;
			debugStr.push(`**KC**[${kcPercent.toFixed(1)}%]`);

			// Item boosts
			let itemBoosts = 0;
			for (const [name, amount] of this.itemBoosts) {
				if (gear.hasEquipped(name, false, true)) {
					itemBoosts += amount;
				}
			}
			const itemBoostPercent = calcWhatPercent(itemBoosts, speedReductionForBoosts);
			const itemBoostsBoostPercent = calcPercentOfNum(itemBoostPercent, speedReductionForBoosts);
			userPercentChange += itemBoostsBoostPercent;
			debugStr.push(`**Boosts**[${itemBoostPercent.toFixed(1)}%]`);

			// Total
			debugStr.push(`**Total**[${calcWhatPercent(userPercentChange, totalSpeedReduction).toFixed(2)}%]`);

			// Death chance
			let deathChance = this.canDie
				? Math.max(0, reduceNumByPercent(55, kcBoostPercent * 2.4 + gearBoostPercent)) + randFloat(4.5, 5.5)
				: 0;
			debugStr.push(`**Death**[${deathChance.toFixed(2)}%]`);

			// Apply a percentage of maxReduction based on the percent of total boosts.
			const percentToAdd = ((userPercentChange / totalSpeedReduction) * maxReduction) / params.party.length;
			totalPercent += percentToAdd;

			bossUsers.push({
				user,
				userPercentChange,
				debugStr: debugStr.join(' '),
				deathChance
			});
		}

		let duration = this.baseDuration;
		duration = reduceNumByPercent(duration, totalPercent);

		// Reduce or increase the duration based on the team size. Solo is longer, big team is faster.
		duration -= duration * (teamSizeBoostPercent(params.party.length) / 100);

		return {
			activitiesThisTrip: 1,
			durationOfTrip: duration,
			timePerActivity: duration,
			extras: { bossUsers },
			extraMessages: bossUsers.map(u => `**${u.user.username}**: ${u.debugStr}`)
		};
	}

	async checkUserRequirements(params: LfgCheckUserRequirements): Promise<string[]> {
		let returnMessage: string[] = [];

		if (params.user.minionIsBusy) {
			returnMessage.push("You are busy right now and can't join this queue!");
		}

		if (params.user.isIronman) {
			returnMessage.push("As an ironman, you can't join mass groups.");
		}

		const [hasReqs, reason] = params.user.hasSkillReqs(this.skillRequirements);
		if (!hasReqs) {
			returnMessage.push(`You don't meet the skill requirements for this activity: ${reason}`);
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
		const kc = params.user.getKC(params.queue.monster!.id);
		const itemsToRemove = calcFood(params.solo, kc);
		const itemCost = this.itemCost && (await this.itemCost(params.user));
		if (itemCost) itemsToRemove.add(itemCost);
		return itemsToRemove;
	}

	checkTeamRequirements(): string[] {
		return [];
	}
}
