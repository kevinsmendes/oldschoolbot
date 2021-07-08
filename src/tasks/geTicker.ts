import { Task } from 'klasa';

import { GrandExchangeStatus, GrandExchangeTable } from '../lib/typeorm/GrandExchangeTable.entity';
import chatHeadImage from '../lib/util/chatHeadImage';
import getOSItem from '../lib/util/getOSItem';

export default class extends Task {
	async init() {
		if (this.client.grandExchangeTicker) {
			clearTimeout(this.client.grandExchangeTicker);
		}
		const ticker = async () => {
			try {
				const completedOffers = await GrandExchangeTable.find({
					where: {
						status: GrandExchangeStatus.Completed
					}
				});
				await Promise.all([
					completedOffers.map(async offer => {
						offer.status = GrandExchangeStatus.Notified;
						await offer.save();
						const user = await this.client.users.fetch(offer.userID);
						await user.send({
							files: [
								await chatHeadImage({
									content: `${user.username}! Your ${offer.type} offer for ${offer.quantity}x ${
										getOSItem(offer.item).name
									} is completed! Run "${
										this.client.options.prefix
									}ge collect" to collect your items.`,
									head: 'geClerk'
								})
							]
						});
					})
				]);
			} catch (err) {
				console.error(err);
			} finally {
				this.client.grandExchangeTicker = setTimeout(ticker, 5000);
			}
		};
		ticker();
	}

	async run() {}
}
