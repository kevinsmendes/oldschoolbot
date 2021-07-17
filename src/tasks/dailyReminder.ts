import { Time } from 'e';
import { Task, TaskStore } from 'klasa';

import { production } from '../config';
import { client } from '../index';
import { UserSettings } from '../lib/settings/types/UserSettings';
import { noOp } from '../lib/util';

const dailyTickInterval = Time.Minute * 5;

export default class extends Task {
	public constructor(store: TaskStore, file: string[], directory: string) {
		super(store, file, directory);
		this.enabled = false;
	}

	async init() {
		if (!production) return;
		if (this.client.dailyReminderTicker) {
			clearInterval(this.client.dailyReminderTicker);
		}
		this.client.dailyReminderTicker = setInterval(this.dailyReminderTick.bind(this), dailyTickInterval);
	}

	async run() {
		this.dailyReminderTick();
	}

	async dailyReminderTick() {
		const result = await client.query<{ id: string }[]>(
			'SELECT id FROM users WHERE bitfield && \'{2,3,4,5,6,7,8}\'::int[] AND "lastDailyTimestamp" != -1 AND to_timestamp("lastDailyTimestamp" / 1000) < now() - interval \'12 hours\';'
		);

		for (const row of result.values()) {
			const user = await client.users.fetch(row.id);

			await user.settings.update(UserSettings.LastDailyTimestamp, -1);
			await user.send('Your daily is ready!').catch(noOp);
		}
	}
}
