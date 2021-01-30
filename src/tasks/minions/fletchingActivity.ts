import { Task } from 'klasa';

import { Time } from '../../lib/constants';
import { getRandomMysteryBox } from '../../lib/data/openables';
import Fletching from '../../lib/skilling/skills/fletching/';
import { SkillsEnum } from '../../lib/skilling/types';
import { FletchingActivityTaskOptions } from '../../lib/types/minions';
import { multiplyBank, roll } from '../../lib/util';
import { handleTripFinish } from '../../lib/util/handleTripFinish';

export default class extends Task {
	async run(data: FletchingActivityTaskOptions) {
		let { fletchableName, quantity, userID, channelID, duration } = data;
		const user = await this.client.users.fetch(userID);
		user.incrementMinionDailyDuration(duration);
		const currentLevel = user.skillLevel(SkillsEnum.Fletching);

		const fletchableItem = Fletching.Fletchables.find(
			fletchable => fletchable.name === fletchableName
		);

		if (!fletchableItem) return;

		const xpReceived = quantity * fletchableItem.xp;

		if (fletchableItem.outputMultiple) {
			quantity *= fletchableItem.outputMultiple;
		}

		await user.addXP(SkillsEnum.Fletching, xpReceived);
		const newLevel = user.skillLevel(SkillsEnum.Fletching);

		let str = `${user}, ${user.minionName} finished fletching ${quantity} ${
			fletchableItem.name +
				fletchableItem.name.charAt(fletchableItem.name.length - 1).toLowerCase() ===
			's'
				? ''
				: 's'
		}, you also received ${xpReceived.toLocaleString()} XP.`;

		if (newLevel > currentLevel) {
			str += `\n\n${user.minionName}'s Fletching level is now ${newLevel}!`;
		}

		let loot = {
			[fletchableItem.id]: quantity
		};

		if (duration > Time.Minute * 20 && roll(10)) {
			loot = multiplyBank(loot, 2);
			loot[getRandomMysteryBox()] = 1;
		}

		await user.addItemsToBank(loot, true);

		handleTripFinish(
			this.client,
			user,
			channelID,
			str,
			res => {
				user.log(
					`continued trip of ${quantity}x ${fletchableItem.name}[${fletchableItem.id}]`
				);
				return this.client.commands
					.get('fletch')!
					.run(res, [quantity, fletchableItem.name]);
			},
			undefined,
			data
		);
	}
}
