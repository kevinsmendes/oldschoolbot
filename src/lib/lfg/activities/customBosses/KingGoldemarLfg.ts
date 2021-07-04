import { percentChance, randArrItem } from 'e';
import { KlasaUser } from 'klasa';
import { Bank } from 'oldschooljs';

import { Activity, Events } from '../../../constants';
import KingGoldemar, { KingGoldemarLootTable } from '../../../minions/data/killableMonsters/custom/KingGoldemar';
import { addMonsterXP } from '../../../minions/functions';
import { ClientSettings } from '../../../settings/types/ClientSettings';
import { ActivityTaskOptions, BossActivityTaskOptions, NewBossOptions } from '../../../types/minions';
import { roll, updateBankSetting } from '../../../util';
import LfgInterface, {
	LfgCheckUserRequirements,
	LfgHandleTripFinish,
	LfgHandleTripFinishReturn,
	lfgReturnMessageInterface
} from '../../LfgInterface';
import BossBase, { calcDwwhChance } from './BossBase';

export default class extends BossBase implements LfgInterface {
	activity: ActivityTaskOptions = <BossActivityTaskOptions>{ type: Activity.KingGoldemar };

	async HandleTripFinish(params: LfgHandleTripFinish): Promise<LfgHandleTripFinishReturn> {
		const { duration, bossUsers } = <NewBossOptions>params.data;
		const { client } = params;
		const data = <BossActivityTaskOptions>params.data;
		let usersWithLoot: lfgReturnMessageInterface[] = [];
		const usersWithoutLoot = <string[]>[];
		let extraMessage = [];
		const deaths: KlasaUser[] = [];
		const users: KlasaUser[] = await Promise.all(data.users.map(i => client.users.fetch(i)));
		const getUser = (id: string) => users.find(u => u.id === id)!;
		const dwwhTable: KlasaUser[] = [];

		for (const { user, deathChance } of bossUsers) {
			if (percentChance(deathChance)) {
				deaths.push(getUser(user));
			} else {
				dwwhTable.push(getUser(user));
			}
		}

		if (deaths.length === users.length) {
			extraMessage.push('Your team was crushed by King Goldemar, you never stood a chance.');
		} else {
			await Promise.all(users.map(u => u.incrementMonsterScore(KingGoldemar.id, 1)));
			let dwwhChance = calcDwwhChance(users);
			const gotDWWH = roll(dwwhChance);
			const dwwhRecipient = gotDWWH ? randArrItem(dwwhTable) : null;
			extraMessage.push(
				gotDWWH && dwwhRecipient
					? `${dwwhRecipient?.username} delivers a crushing blow to King Goldemars warhammer, breaking it. The king has no choice but to flee the chambers, **leaving behind his broken hammer.**`
					: 'Your team brought King Goldemar to a very weak state, he fled the chambers before he could be killed and escaped through a secret exit, promising to get revenge on you.'
			);
			if (gotDWWH && dwwhRecipient) {
				client.emit(
					Events.ServerNotification,
					`**${dwwhRecipient?.username}** just received a **Broken dwarven warhammer** in a team of ${users.length}!`
				);
			}
			const totalLoot = new Bank();
			for (const user of users.filter(u => !deaths.includes(u))) {
				const loot = new Bank().add(KingGoldemarLootTable.roll());
				if (dwwhRecipient === user) {
					loot.add('Broken dwarven warhammer');
				}
				totalLoot.add(loot);
				await addMonsterXP(user, {
					monsterID: KingGoldemar.id,
					quantity: 1,
					duration,
					isOnTask: false,
					taskQuantity: null
				});
				await user.addItemsToBank(loot, true);

				usersWithLoot.push({ user, emoji: false, lootedItems: loot, spoiler: false });
			}
			await updateBankSetting(client, ClientSettings.EconomyStats.KingGoldemarLoot, totalLoot);
		}
		return { usersWithLoot, usersWithoutLoot, extraMessage };
	}

	async checkUserRequirements(params: LfgCheckUserRequirements): Promise<string[]> {
		return super.checkUserRequirements(params);
	}
}
