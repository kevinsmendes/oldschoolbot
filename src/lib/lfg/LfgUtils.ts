import { Time } from 'e';
import { KlasaClient, KlasaUser } from 'klasa';
import { Bank, Monsters } from 'oldschooljs';

import { Emoji } from '../constants';
import { GearSetupTypes } from '../gear';
import { KalphiteKingMonster } from '../kalphiteking';
import { effectiveMonsters, NightmareMonster } from '../minions/data/killableMonsters';
import KingGoldemar from '../minions/data/killableMonsters/custom/KingGoldemar';
import { KillableMonster } from '../minions/types';
import { NexMonster } from '../nex';
import { ClientSettings } from '../settings/types/ClientSettings';
import { Gear } from '../structures/Gear';
import { channelIsSendable, noOp } from '../util';
import BarbarianAssault from './activities/BarbarianAssault';
import ChambersOfXeric from './activities/ChambersOfXeric';
import { gpCostPerKill } from './activities/customBosses/BossBase';
import KingGoldemarLfg from './activities/customBosses/KingGoldemarLfg';
import Default from './activities/Default';
import Dungeoneering, { DungeoneeringFloorIds } from './activities/Dungeoneering';
import KalphiteKing from './activities/KalphiteKing';
import Nex from './activities/Nex';
import Nightmare from './activities/Nightmare';
import SoulWars from './activities/SoulWars';
import { LfgCategories, LfgQueueProperties } from './LfgInterface';

export const LFG_MIN_USERS = 2;
export const LFG_MAX_USERS = 2;
export const LFG_WAIT_TIME = 5 * Time.Second;

export const availableQueues: LfgQueueProperties[] = [
	{
		uniqueID: 1,
		name: Monsters.KrilTsutsaroth.name,
		aliases: Monsters.KrilTsutsaroth.aliases,
		lfgClass: new Default(),
		thumbnail: 'https://imgur.com/xlLoBwD.png',
		monster: getMonster(Monsters.KrilTsutsaroth.id),
		minQueueSize: LFG_MIN_USERS,
		maxQueueSize: LFG_MAX_USERS,
		allowSolo: true,
		allowPrivate: true,
		queueEconomyCost: [ClientSettings.EconomyStats.PVMCost],
		category: LfgCategories.PvM
	},
	{
		uniqueID: 2,
		name: Monsters.GeneralGraardor.name,
		aliases: Monsters.GeneralGraardor.aliases,
		lfgClass: new Default(),
		thumbnail: 'https://imgur.com/l9mG0UH.png',
		monster: getMonster(Monsters.GeneralGraardor.id),
		minQueueSize: LFG_MIN_USERS,
		maxQueueSize: LFG_MAX_USERS,
		allowSolo: true,
		allowPrivate: true,
		queueEconomyCost: [ClientSettings.EconomyStats.PVMCost],
		category: LfgCategories.PvM
	},
	{
		uniqueID: 3,
		name: Monsters.Kreearra.name,
		aliases: Monsters.Kreearra.aliases,
		lfgClass: new Default(),
		thumbnail: 'https://imgur.com/149XEBt.png',
		monster: getMonster(Monsters.Kreearra.id),
		minQueueSize: LFG_MIN_USERS,
		maxQueueSize: LFG_MAX_USERS,
		allowSolo: true,
		allowPrivate: true,
		queueEconomyCost: [ClientSettings.EconomyStats.PVMCost],
		category: LfgCategories.PvM
	},
	{
		uniqueID: 4,
		name: Monsters.CommanderZilyana.name,
		aliases: Monsters.CommanderZilyana.aliases,
		lfgClass: new Default(),
		thumbnail: 'https://imgur.com/rrBerRu.png',
		monster: getMonster(Monsters.CommanderZilyana.id),
		minQueueSize: LFG_MIN_USERS,
		maxQueueSize: LFG_MAX_USERS,
		allowSolo: true,
		allowPrivate: true,
		queueEconomyCost: [ClientSettings.EconomyStats.PVMCost],
		category: LfgCategories.PvM
	},
	{
		uniqueID: 5,
		name: Monsters.CorporealBeast.name,
		aliases: Monsters.CorporealBeast.aliases,
		lfgClass: new Default(),
		thumbnail: 'https://imgur.com/VgT5KjT.png',
		monster: getMonster(Monsters.CorporealBeast.id),
		minQueueSize: LFG_MIN_USERS,
		maxQueueSize: LFG_MAX_USERS,
		allowSolo: true,
		allowPrivate: true,
		queueEconomyCost: [ClientSettings.EconomyStats.PVMCost],
		category: LfgCategories.PvM
	},
	{
		uniqueID: 6,
		name: NightmareMonster.name,
		aliases: NightmareMonster.aliases,
		lfgClass: new Nightmare(),
		thumbnail: 'https://imgur.com/6lnQKY6.png',
		monster: getMonster(NightmareMonster.id),
		minQueueSize: 2,
		maxQueueSize: 10,
		allowSolo: true,
		allowPrivate: true,
		queueEconomyCost: [ClientSettings.EconomyStats.PVMCost],
		category: LfgCategories.PvM
	},
	{
		uniqueID: 7,
		name: `${NightmareMonster.name} (Small)`,
		aliases: ['nightmare small', 'nms', 'nm small'],
		lfgClass: new Nightmare(),
		thumbnail: 'https://imgur.com/6lnQKY6.png',
		monster: getMonster(NightmareMonster.id),
		minQueueSize: 2,
		maxQueueSize: 5,
		allowSolo: false,
		allowPrivate: false,
		queueEconomyCost: [ClientSettings.EconomyStats.PVMCost],
		category: LfgCategories.PvM
	},
	{
		uniqueID: 8,
		name: 'The Chambers of Xeric',
		aliases: ['raids', 'chambers of xeric', 'the chambers of xeric', 'raid1', 'cox'],
		lfgClass: new ChambersOfXeric(),
		extraParams: { isChallengeMode: false },
		thumbnail: 'https://imgur.com/hTQgPxt.png',
		minQueueSize: 2,
		maxQueueSize: 15,
		allowSolo: true,
		allowPrivate: true,
		queueEconomyCost: [ClientSettings.EconomyStats.PVMCost, ClientSettings.EconomyStats.CoxCost],
		category: LfgCategories.PvM
	},
	{
		uniqueID: 9,
		name: 'The Chambers of Xeric (CM)',
		aliases: ['raids cm', 'chambers of xeric cm', 'the chambers of xeric cm', 'raid1 cm', 'cox cm'],
		lfgClass: new ChambersOfXeric(),
		extraParams: { isChallengeMode: true },
		thumbnail: 'https://imgur.com/X8KqxcB.png',
		minQueueSize: 2,
		maxQueueSize: 15,
		allowSolo: true,
		allowPrivate: true,
		queueEconomyCost: [ClientSettings.EconomyStats.PVMCost, ClientSettings.EconomyStats.CoxCost],
		category: LfgCategories.PvM
	},
	{
		uniqueID: 10,
		name: 'Soul Wars',
		aliases: ['sw'],
		lfgClass: new SoulWars(),
		thumbnail: 'https://imgur.com/rOTjdfO.png',
		minQueueSize: 2,
		maxQueueSize: 99,
		allowSolo: true,
		allowPrivate: true,
		cooldown: 10 * Time.Second,
		category: LfgCategories.Minigame
	},
	{
		uniqueID: 11,
		name: 'Barbarian Assault',
		aliases: ['ba'],
		lfgClass: new BarbarianAssault(),
		thumbnail: 'https://imgur.com/380Yp1N.png',
		minQueueSize: 2,
		maxQueueSize: 4,
		allowSolo: true,
		allowPrivate: true,
		cooldown: 30 * Time.Second,
		category: LfgCategories.Minigame
	},
	{
		uniqueID: 12,
		name: KingGoldemar.name,
		aliases: KingGoldemar.aliases,
		lfgClass: new KingGoldemarLfg({
			baseDuration: Time.Minute * 120,
			baseFoodRequired: 500,
			skillRequirements: {
				attack: 105,
				strength: 105,
				defence: 105
			},
			itemBoosts: [
				['Drygore longsword', 10],
				['Offhand drygore longsword', 5],
				['Gorajan warrior helmet', 2],
				['Gorajan warrior top', 4],
				['Gorajan warrior legs', 2],
				['Gorajan warrior gloves', 1],
				['Gorajan warrior boots', 1],
				["Brawler's hook necklace", 4]
			],
			bisGear: new Gear({
				head: 'Gorajan warrior helmet',
				body: 'Gorajan warrior top',
				legs: 'Gorajan warrior legs',
				hands: 'Gorajan warrior gloves',
				feet: 'Gorajan warrior boots',
				cape: 'Abyssal cape',
				ring: 'Warrior ring(i)',
				weapon: 'Drygore longsword',
				shield: 'Offhand drygore longsword',
				neck: "Brawler's hook necklace"
			}),
			gearSetup: GearSetupTypes.Melee,
			itemCost: async user => new Bank().add('Coins', gpCostPerKill(user)),
			mostImportantStat: 'attack_slash',
			food: () => new Bank(),
			canDie: true,
			kcLearningCap: 50
		}),
		thumbnail: 'https://imgur.com/BokgLFq.png',
		monster: getMonster(KingGoldemar.id),
		minQueueSize: 2,
		maxQueueSize: LFG_MAX_USERS,
		allowSolo: false,
		allowPrivate: true,
		queueEconomyCost: [ClientSettings.EconomyStats.PVMCost, ClientSettings.EconomyStats.KingGoldemarCost],
		category: LfgCategories.PvM
	},
	{
		uniqueID: 13,
		name: NexMonster.name,
		aliases: NexMonster.aliases,
		lfgClass: new Nex(),
		thumbnail: 'https://imgur.com/Hznlkhj.png',
		monster: NexMonster,
		minQueueSize: 2,
		maxQueueSize: 8,
		allowSolo: true,
		allowPrivate: true,
		queueEconomyCost: [ClientSettings.EconomyStats.PVMCost, ClientSettings.EconomyStats.NexCost],
		category: LfgCategories.PvM
	},
	{
		uniqueID: 14,
		name: KalphiteKingMonster.name,
		aliases: KalphiteKingMonster.aliases,
		lfgClass: new KalphiteKing(),
		thumbnail: 'https://imgur.com/cf7CjW2.png',
		monster: KalphiteKingMonster,
		minQueueSize: 2,
		maxQueueSize: 50,
		allowSolo: true,
		allowPrivate: true,
		queueEconomyCost: [ClientSettings.EconomyStats.PVMCost, ClientSettings.EconomyStats.KalphiteKingCost],
		category: LfgCategories.PvM
	},
	{
		uniqueID: 15,
		name: 'Dungeoneering - Best Floor',
		aliases: ['dg'],
		lfgClass: new Dungeoneering(),
		thumbnail: 'https://imgur.com/013QE6M.png',
		minQueueSize: 2,
		maxQueueSize: 5,
		extraParams: { joinBestQueue: true },
		allowSolo: true,
		allowPrivate: true,
		category: LfgCategories.Skilling
	},
	{
		uniqueID: DungeoneeringFloorIds.Floor1,
		name: 'Dungeoneering - Floor 1',
		aliases: ['dg 1'],
		lfgClass: new Dungeoneering(),
		thumbnail: 'https://imgur.com/013QE6M.png',
		minQueueSize: 2,
		maxQueueSize: 5,
		extraParams: { floor: 1 },
		allowSolo: true,
		allowPrivate: true,
		category: LfgCategories.Skilling
	},
	{
		uniqueID: DungeoneeringFloorIds.Floor2,
		name: 'Dungeoneering - Floor 2',
		aliases: ['dg 2'],
		lfgClass: new Dungeoneering(),
		thumbnail: 'https://imgur.com/013QE6M.png',
		minQueueSize: 2,
		maxQueueSize: 5,
		extraParams: { floor: 2 },
		allowSolo: true,
		allowPrivate: true,
		category: LfgCategories.Skilling
	},
	{
		uniqueID: DungeoneeringFloorIds.Floor3,
		name: 'Dungeoneering - Floor 3',
		aliases: ['dg 3'],
		lfgClass: new Dungeoneering(),
		thumbnail: 'https://imgur.com/013QE6M.png',
		minQueueSize: 2,
		maxQueueSize: 5,
		extraParams: { floor: 3 },
		allowSolo: true,
		allowPrivate: true,
		category: LfgCategories.Skilling
	},
	{
		uniqueID: DungeoneeringFloorIds.Floor4,
		name: 'Dungeoneering - Floor 4',
		aliases: ['dg 4'],
		lfgClass: new Dungeoneering(),
		thumbnail: 'https://imgur.com/013QE6M.png',
		minQueueSize: 2,
		maxQueueSize: 5,
		extraParams: { floor: 4 },
		allowSolo: true,
		allowPrivate: true,
		category: LfgCategories.Skilling
	},
	{
		uniqueID: DungeoneeringFloorIds.Floor5,
		name: 'Dungeoneering - Floor 5',
		aliases: ['dg 5'],
		lfgClass: new Dungeoneering(),
		thumbnail: 'https://imgur.com/013QE6M.png',
		minQueueSize: 2,
		maxQueueSize: 5,
		extraParams: { floor: 5 },
		allowSolo: true,
		allowPrivate: true,
		category: LfgCategories.Skilling
	},
	{
		uniqueID: DungeoneeringFloorIds.Floor6,
		name: 'Dungeoneering - Floor 6',
		aliases: ['dg 6'],
		lfgClass: new Dungeoneering(),
		thumbnail: 'https://imgur.com/013QE6M.png',
		minQueueSize: 2,
		maxQueueSize: 5,
		extraParams: { floor: 6 },
		allowSolo: true,
		allowPrivate: true,
		category: LfgCategories.Skilling
	},
	{
		uniqueID: DungeoneeringFloorIds.Floor7,
		name: 'Dungeoneering - Floor 7',
		aliases: ['dg 7'],
		lfgClass: new Dungeoneering(),
		thumbnail: 'https://imgur.com/013QE6M.png',
		minQueueSize: 2,
		maxQueueSize: 5,
		extraParams: { floor: 7 },
		allowSolo: true,
		allowPrivate: true,
		category: LfgCategories.Skilling
	}
];

export function prepareLFGMessage(
	activityName: string,
	qty: number,
	channels: Record<string, string[]> | false | undefined
) {
	const toReturn: Record<string, string> = {};
	if (!channels) return toReturn;
	for (const channel of Object.keys(channels)) {
		toReturn[channel] = `LFG activity of ${
			qty > 1 ? `${qty}x ` : ''
		}**${activityName}** has returned! Here are the spoils:\n\n`;
	}
	return toReturn;
}

export function addLFGLoot(
	lootString: Record<string, string>,
	emoji: Emoji | false,
	user: KlasaUser,
	readableList: string,
	spoiler: boolean,
	channels: Record<string, string[]> | false | undefined
) {
	const spoilerTags = spoiler ? '||' : '';
	if (!channels) return lootString;
	for (const channel of Object.entries(channels)) {
		lootString[channel[0]] += `${emoji ? emoji : ''} **${
			channel[1].includes(user.id) ? user : user.username
		} received:** ${spoilerTags}${readableList}${spoilerTags}\n`;
	}
	return lootString;
}

export function addLFGText(
	lootString: Record<string, string>,
	text: string | string[],
	channels: Record<string, string[]> | false | undefined
) {
	if (!channels) return lootString;
	if (Array.isArray(text)) {
		text = text.join('\n');
	}
	for (const channel of Object.entries(channels)) {
		lootString[channel[0]] += `\n${text}`;
	}
	return lootString;
}

export async function addLFGNoDrops(
	lootString: Record<string, string>,
	client: KlasaClient,
	users: string[],
	channels: Record<string, string[]> | false | undefined
) {
	if (!channels) return lootString;
	const klasaUsers: KlasaUser[] = [];
	for (const u of users) {
		const _u = await client.users.fetch(u).catch(noOp);
		if (_u) klasaUsers.push(_u);
	}
	for (const channel of Object.entries(channels)) {
		const users = klasaUsers.map(user => (channel[1].includes(user.id) ? `<@${user.id}>` : user.username));
		if (users.length > 0) {
			lootString[channel[0]] += `${users.join(', ')} - Got no loot, sad!`;
		}
	}
	return lootString;
}

export async function sendLFGMessages(
	lootString: Record<string, string>,
	client: KlasaClient,
	channels: Record<string, string[]> | false | undefined
) {
	if (!channels) return false;
	for (const _channel of Object.keys(channels)) {
		const channel = client.channels.cache.get(_channel);
		if (channelIsSendable(channel)) {
			await channel.send(lootString[_channel]);
		}
	}
	return lootString;
}

export async function sendLFGErrorMessage(
	message: string,
	client: KlasaClient,
	channels: Record<string, string[]> | false | undefined
) {
	if (!channels) return false;
	for (const _channel of Object.keys(channels)) {
		const channel = client.channels.cache.get(_channel);
		if (channelIsSendable(channel)) {
			await channel.send(message);
		}
	}
}

export function getMonster(monsterId: number): KillableMonster {
	return <KillableMonster>effectiveMonsters.find(m => m.id === monsterId);
}

// Validate the LFG Queue for unique IDS
if ([...new Set(availableQueues.map(queue => queue.uniqueID))].length !== availableQueues.length) {
	throw new Error('LFG Queues have duplicate uniqueID!');
}
