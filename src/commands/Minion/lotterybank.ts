import { CommandStore, KlasaMessage } from 'klasa';
import { Bank } from 'oldschooljs';

import { Events } from '../../lib/constants';
import { ClientSettings } from '../../lib/settings/types/ClientSettings';
import { BotCommand } from '../../lib/structures/BotCommand';
import { addBanks, itemID } from '../../lib/util';

const options = {
	max: 1,
	time: 10000,
	errors: ['time']
};

export default class extends BotCommand {
	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			cooldown: 1,
			usage: '(items:...TradeableBank)',
			usageDelim: ' ',
			oneAtTime: true,
			categoryFlags: ['minion'],
			description: 'Sacrifices items from your bank.',
			examples: ['+sacrifice 1 Elysian sigil']
		});
	}

	async run(msg: KlasaMessage, [[bankToSell, totalPrice]]: [[Bank, number]]) {
		if (bankToSell.amount('Lottery ticket')) {
			bankToSell.remove('Lottery ticket', bankToSell.amount('Lottery ticket'));
		}
		if (bankToSell.amount('Bank lottery ticket')) {
			bankToSell.remove('Bank lottery ticket', bankToSell.amount('Bank lottery ticket'));
		}
		if (bankToSell.length === 0) return msg.send('wtf');
		let amountOfTickets = Math.floor(totalPrice / 10_000_000);

		if (amountOfTickets < 1) {
			return msg.send(`Those items aren't worth enough.`);
		}

		if (!msg.flagArgs.confirm && !msg.flagArgs.cf) {
			const sellMsg = await msg.channel.send(
				`${msg.author}, say \`confirm\` to commit ${bankToSell} to the bank lottery - you'll receive **${amountOfTickets} bank lottery tickets**.`
			);

			try {
				await msg.channel.awaitMessages(
					_msg =>
						_msg.author.id === msg.author.id &&
						_msg.content.toLowerCase() === 'confirm',
					options
				);
			} catch (err) {
				return sellMsg.edit(`Cancelling bank lottery sacrifice.`);
			}
		}

		if (totalPrice > 200_000_000) {
			this.client.emit(
				Events.ServerNotification,
				`${msg.author.username} just committed this to the bank lottery: ${bankToSell}`
			);
		}

		await msg.author.addItemsToBank({ [itemID('Bank lottery ticket')]: amountOfTickets }, true);
		await msg.author.removeItemsFromBank(bankToSell.bank);

		await this.client.settings.update(
			ClientSettings.BankLottery,
			addBanks([this.client.settings.get(ClientSettings.BankLottery), bankToSell.bank])
		);

		return msg.send(
			`You commited ${bankToSell} to the bank lottery, and received ${amountOfTickets}x bank lottery tickets.`
		);
	}
}
