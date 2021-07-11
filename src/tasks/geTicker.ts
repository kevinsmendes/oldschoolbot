import { Task } from 'klasa';
import { getConnection } from 'typeorm';

import { GrandExchangeStatus, GrandExchangeTable } from '../lib/typeorm/GrandExchangeTable.entity';
import chatHeadImage from '../lib/util/chatHeadImage';
import getOSItem from '../lib/util/getOSItem';

export default class extends Task {
	async init() {
		// Handles notifications on completed offers that the database motifies
		if (this.client.grandExchangeTicker) {
			clearTimeout(this.client.grandExchangeTicker);
		}
		// Handles limited offers - It checks if a limited offer can be activated again after the user is not limited
		// anymore. Would be better to move this to the db if possible using pg_cron extension
		if (this.client.grandExchangeUpdateTicker) {
			clearTimeout(this.client.grandExchangeUpdateTicker);
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
				this.client.grandExchangeTicker = setTimeout(ticker, 5_000);
			}
		};
		const tickerUpdate = async () => {
			try {
				await getConnection().query('CALL public."grandExchangeUpdateLimitedOffers"();');
			} catch (err) {
				console.error(err);
			} finally {
				this.client.grandExchangeUpdateTicker = setTimeout(tickerUpdate, 30_000);
			}
		};
		ticker();
		tickerUpdate();
	}

	async run() {}
}
