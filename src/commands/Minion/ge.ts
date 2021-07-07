import { MessageButton, MessageOptions, MessageSelectMenu } from 'discord.js';
import { Time } from 'e';
import { CommandStore, KlasaMessage } from 'klasa';
import { Items } from 'oldschooljs';
import { Item } from 'oldschooljs/dist/meta/types';
import { itemNameMap } from 'oldschooljs/dist/structures/Items';
import { fromKMB } from 'oldschooljs/dist/util';

import { SILENT_ERROR } from '../../lib/constants';
import { GuildSettings } from '../../lib/settings/types/GuildSettings';
import { BotCommand } from '../../lib/structures/BotCommand';
import { GrandExchangeTable, GrandExchangeType } from '../../lib/typeorm/GrandExchangeTable.entity';
import { cleanString, stringMatches } from '../../lib/util';
import chatHeadImage from '../../lib/util/chatHeadImage';
import getOSItem from '../../lib/util/getOSItem';

export default class extends BotCommand {
	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			cooldown: 1,
			usage: '[slots] [cmd:...string]',
			usageDelim: ' ',
			oneAtTime: true,
			subcommands: true
		});
	}

	prefix(msg: KlasaMessage) {
		return msg.guild ? msg.guild.settings.get(GuildSettings.Prefix) : this.client.options.prefix;
	}

	async invalidCommand(msg: KlasaMessage) {
		const prefix = this.prefix(msg);
		return this.clerkChat(
			msg,
			`I am sorry, but I didn't understood that. Use commands like this: "${prefix}ge sell 1 2 blessed spirit shield 500K" or like this "${prefix}ge buy 2 1000 raw shark 700". You can use "${prefix}ge help" for more information.`
		);
	}

	async clerkChat(msg: KlasaMessage, message: string, options: MessageOptions = {}) {
		return msg.channel.send({
			files: [
				await chatHeadImage({
					content: message,
					head: 'geClerk'
				})
			],
			...options
		});
	}

	async checkDms(msg: KlasaMessage) {
		// Not being done in DMs
		if (msg.channel !== msg.author.dmChannel) {
			await Promise.all([
				msg.channel.send(
					`Financial matters can only be done in private ${msg.author.username}. Please, follow me.`
				),
				msg.author.send({
					files: [
						await chatHeadImage({
							content: `\n        Let's talk here. Ok, uhh... \nHello ${msg.author.username}! What can I do to help you?`,
							head: 'geClerk'
						})
					]
				})
			]);
			throw Error(SILENT_ERROR);
		}
	}

	async slots(msg: KlasaMessage, [cmd]: [string]) {
		console.log(msg.author.tag, cmd, 'slots');
		await this.checkDms(msg);
	}

	async run(msg: KlasaMessage, [cmd]: [string]) {
		console.log(msg.author.tag, cmd, 'defaults here');
		await this.checkDms(msg);

		const prefix = this.prefix(msg);

		if (!cmd) {
			return this.invalidCommand(msg);
		}

		const explodedCmd = cmd.split(' ');
		// Get price per item
		const itemPrice = fromKMB(explodedCmd.pop() ?? '');
		const type = explodedCmd.shift();
		const slot = Number(explodedCmd.shift());
		const quantity = Number(explodedCmd.shift());
		const item = explodedCmd.join(' ');
		let itemArray: Item[] = [];

		if (isNaN(itemPrice + slot + quantity) || (type !== GrandExchangeType.Buy && type !== GrandExchangeType.Sell)) {
			return this.invalidCommand(msg);
		}

		// Handle slot being used
		if (![1, 2, 3, 4, 5, 6, 7, 8].find(s => s === Number(slot))) {
			// TODO Calculate user slots
			return this.clerkChat(msg, 'This is not a valid slot. You can only use slots from [CALCULATE_USER_SLOTS]');
		}
		if (
			await GrandExchangeTable.findOne({
				where: {
					userID: msg.author.id,
					slot,
					status: null
				}
			})
		) {
			return this.clerkChat(
				msg,
				`This slot is already being used. Check your slots by issuing ${prefix}ge slots`
			);
		}

		try {
			let itemCheck = item;
			const parsed = Number(item);
			if (!isNaN(parsed)) {
				itemCheck = getOSItem(parsed)?.name;
			}
			itemArray = Items.filter(
				i =>
					i.tradeable_on_ge &&
					(itemNameMap.get(cleanString(itemCheck)) === i.id || stringMatches(i.name, itemCheck))
			).array() as Item[];
		} catch (e) {}

		if (!itemArray.length) {
			return this.clerkChat(
				msg,
				`I am sorry sir, but I could not find any item with the name or ID ${item}. It either doesn't exists or it is not tradeable.`
			);
		}

		let selectedItem = <Item>{};
		const totalPrice = quantity * itemPrice;
		let channelMessage: KlasaMessage | undefined = undefined;

		if (type === 'sell') {
			// Check if the user has the item in bank
			const userBank = msg.author.bank();
			const osItem = itemArray.find(i => userBank.bank[i.id]);
			if (!osItem) {
				return msg.channel.send("You don't have any of this item to sell!");
			}
			if (userBank.amount(osItem.id) < quantity) {
				return msg.channel.send(
					`You don't have ${quantity.toLocaleString()}x ${osItem.name} [ID: ${
						osItem.id
					}] to to sell. You only have ${userBank
						.amount(osItem.id)
						.toLocaleString()} of this item in your bank.`
				);
			}
			selectedItem = osItem;
		} else {
			// Filter item array to only include tradeable items
			itemArray = itemArray.filter(i => i.tradeable_on_ge);

			if (itemArray.length === 0) {
				return msg.channel.send("Sorry, this is not tradeable item. We can't trade those.");
			}

			if (msg.author.bank({ withGP: true }).amount(995) < totalPrice) {
				return msg.channel.send(
					`You don't have enought GP for this transaction. You need ${totalPrice.toLocaleString()} GP to buy this item for the price informed.`
				);
			}

			if (itemArray.length > 0) {
				channelMessage = await this.clerkChat(
					msg,
					'I am sorry sir, but I found too many items with the name you typed. Could you select the correct one in the list below?',
					{
						components: [
							[
								new MessageSelectMenu({
									type: 3,
									customID: 'itemSelect',
									options: itemArray
										.filter(i => i.tradeable_on_ge)
										.map(i => {
											return {
												label: `${i.name.length > 25 ? `${i.name.substr(0, 22)}...` : i.name}`,
												value: String(i.id),
												description: `[ID: ${i.id}] ${i.examine}`
											};
										}),
									placeholder: 'Select an item...',
									maxValues: 1,
									minValues: 1
								})
							]
						]
					}
				);

				try {
					const selection = await channelMessage.awaitMessageComponentInteraction({
						filter: i => {
							if (i.user.id !== msg.author.id) {
								i.reply({
									ephemeral: true,
									// This should NEVER be displayed, ever, as we force any GE transaction to be made
									// via DMs, so, just a funny safeguard.
									content: 'What? How did you... THIEF! GUARDS! GUARDS! We have an intruder!'
								});
								return false;
							}
							return true;
						},
						time: Time.Second * 15
					});
					if (selection.customID === 'itemSelect') {
						// eslint-disable-next-line @typescript-eslint/ban-ts-comment
						// @ts-ignore
						selectedItem = getOSItem(selection.values.pop());
						await channelMessage.delete();
					}
				} catch {
					await channelMessage.delete();
					await this.clerkChat(
						msg,
						'I am sorry, I got other people to attend. When you are ready to do some business, talk with me again.'
					);
					throw new Error(SILENT_ERROR);
				}
			} else {
				selectedItem = itemArray.pop()!;
			}
		}

		channelMessage = await this.clerkChat(
			msg,
			`Are you sure you want to ${type} ${quantity}x ${
				selectedItem.name
			} for ${totalPrice.toLocaleString()} GP? The recommended price for this is item is ${selectedItem.price.toLocaleString()} GP.`,
			{
				components: [
					[
						new MessageButton({
							label: 'Yes, I am sure.',
							style: 'PRIMARY',
							customID: 'confirmGeOffer'
						}),
						new MessageButton({
							label: 'On a second thought...',
							style: 'DANGER',
							customID: 'cancelGeOffer'
						})
					]
				]
			}
		);

		try {
			const selection = await channelMessage.awaitMessageComponentInteraction({
				filter: i => {
					if (i.user.id !== msg.author.id) {
						i.reply({
							ephemeral: true,
							// This should NEVER be displayed, ever, as we force any GE transaction to be made
							// via DMs, so, just a funny safeguard.
							content: 'What? How did you... THIEF! GUARDS! GUARDS! We have an intruder!'
						});
						return false;
					}
					return true;
				},
				time: Time.Second * 15
			});
			if (selection.customID === 'cancelGeOffer') {
				await channelMessage.delete();
				return this.clerkChat(msg, "It is OK. I'll be here when you want to sell or buy anything.");
			}
			if (selection.customID === 'confirmGeOffer') {
				await channelMessage.delete();
			}
		} catch {
			await channelMessage.delete();
			return this.clerkChat(
				msg,
				'I am sorry, I got other people to attend. When you are ready to do some business, talk with me again.'
			);
		}

		try {
			const table = new GrandExchangeTable();
			table.price = itemPrice;
			table.item = selectedItem.id;
			table.type = type;
			table.quantity = quantity;
			table.userID = msg.author.id;
			table.slot = slot;
			table.dateAdded = new Date();
			table.quantityTraded = 0;
			table.collectionQuantity = 0;
			table.collectionCash = 0;
			await table.save();
		} catch (e) {
			console.log(e);
			return this.clerkChat(
				msg,
				'I am sorry, something went wrong while I was trying to make this transaction go forward. Could you try again in a few moments?'
			);
		}

		console.log(itemPrice, type, slot, quantity, item, itemArray, totalPrice, selectedItem);

		// console.log({ user: msg.author.tag, slot, quantity, type, price, item: Boolean(itemArray) });
		//
		// // Not being done in DMs
		// if (msg.channel !== msg.author.dmChannel) {
		// 	return (
		// 		(await msg.channel.send(
		// 			`Financial matters can only be done in private. Please, come with me ${msg.author.username}.`
		// 		)) && msg.author.send("Let's talk here, so, what do you want to do?")
		// 	);
		// }
		//
		// // Only allow sell or buy commands
		// if (!type) return msg.channel.send('Invalid transaction type. You can only inform **sell** or **buy**.');
		//
		// // Default quantity, if not informed
		// if (!quantity) quantity = 1;
		//
		// // Check if this GE slot is being in use
		// const slotBeingUsed = await GrandExchangeTable.findOne({
		// 	where: {
		// 		userID: msg.author.id,
		// 		slot,
		// 		status: null
		// 	}
		// });
		// if (slotBeingUsed) {
		// 	return msg.channel.send('This slot is already being used. Check your slots by issuing dsabjhdgsahvvd');
		// }
		//
		// // Calculate the total price for this transaction
		// const totalPrice = quantity * price;
		//
		// // Init the message that we'll be sending forward
		// let channelMessage: KlasaMessage | undefined = undefined;
		//
		// // The final item to save
		// let selectedItem = <Item>{};
		//
		// if (type === 'sell') {
		// 	// Check if the user has the item in bank
		// 	const userBank = msg.author.bank();
		// 	const osItem = itemArray.find(i => userBank.bank[i.id]);
		// 	if (!osItem) {
		// 		return msg.channel.send("You don't have any of this item to sell!");
		// 	}
		// 	if (userBank.amount(osItem.id) < quantity) {
		// 		return msg.channel.send(
		// 			`You don't have ${quantity.toLocaleString()}x ${osItem.name} [ID: ${
		// 				osItem.id
		// 			}] to to sell. You only have ${userBank
		// 				.amount(osItem.id)
		// 				.toLocaleString()} of this item in your bank.`
		// 		);
		// 	}
		// 	selectedItem = osItem;
		// } else {
		// 	// Filter item array to only include tradeable items
		// 	itemArray = itemArray.filter(i => i.tradeable_on_ge);
		//
		// 	if (itemArray.length === 0) {
		// 		return msg.channel.send("Sorry, this is not tradeable item. We can't trade those.");
		// 	}
		//
		// 	if (msg.author.bank({ withGP: true }).amount(995) < totalPrice) {
		// 		return msg.channel.send(
		// 			`You don't have enought GP for this transaction. You need ${totalPrice.toLocaleString()} GP to buy this item for the price informed.`
		// 		);
		// 	}
		//
		// 	if (itemArray.length > 0) {
		// 		channelMessage = await msg.channel.send({
		// 			content:
		// 				'I am sorry sir, but I found too many items with the name you typed. Could you select the correct one in the list below?',
		// 			components: [
		// 				[
		// 					new MessageSelectMenu({
		// 						type: 3,
		// 						customID: 'itemSelect',
		// 						options: itemArray
		// 							.filter(i => i.tradeable_on_ge)
		// 							.map(i => {
		// 								return {
		// 									label: `${i.name.length > 25 ? `${i.name.substr(0, 22)}...` : i.name}`,
		// 									value: String(i.id),
		// 									description: `[ID: ${i.id}] ${i.examine}`
		// 								};
		// 							}),
		// 						placeholder: 'Select an item...',
		// 						maxValues: 1,
		// 						minValues: 1
		// 					})
		// 				]
		// 			]
		// 		});
		//
		// 		try {
		// 			const selection = await channelMessage.awaitMessageComponentInteraction({
		// 				filter: i => {
		// 					if (i.user.id !== msg.author.id) {
		// 						i.reply({
		// 							ephemeral: true,
		// 							// This should NEVER be displayed, ever, as we force any GE transaction to be made
		// 							// via DMs, so, just a funny safeguard.
		// 							content: 'What? How did you... THIEF! GUARDS! GUARDS! We have an intruder!'
		// 						});
		// 						return false;
		// 					}
		// 					return true;
		// 				},
		// 				time: Time.Second * 15
		// 			});
		// 			if (selection.customID === 'itemSelect') {
		// 				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// 				// @ts-ignore
		// 				selectedItem = getOSItem(selection.values.pop());
		// 				await channelMessage.delete();
		// 			}
		// 		} catch {
		// 			await channelMessage.edit({
		// 				components: [],
		// 				content: `${msg.author} didn't confirm within the time limit.`
		// 			});
		// 			throw new Error(SILENT_ERROR);
		// 		}
		// 	} else {
		// 		selectedItem = itemArray.pop()!;
		// 	}
		// }
		//
		// await msg.confirm(
		// 	`Are you sure you want to **${type}** **${quantity}x ${
		// 		selectedItem.name
		// 	}** for **${totalPrice.toLocaleString()} GP**? The recommended price for this is item is ${selectedItem.price.toLocaleString()} GP.`
		// );
		//
		// const table = new GrandExchangeTable();
		// table.price = price;
		// table.item = selectedItem.id;
		// table.type = type;
		// table.quantity = quantity;
		// table.userID = msg.author.id;
		// table.slot = slot;
		// table.dateAdded = new Date();
		// table.quantityTraded = 0;
		// table.collectionQuantity = 0;
		// table.collectionCash = 0;
		// await table.save();
	}
}
