import { CanvasRenderingContext2D, createCanvas, Image } from 'canvas';
import { MessageAttachment, MessageButton, MessageOptions, MessageSelectMenu } from 'discord.js';
import { Time } from 'e';
import fs from 'fs';
import { CommandStore, KlasaMessage } from 'klasa';
import { Bank, Items } from 'oldschooljs';
import { Item } from 'oldschooljs/dist/meta/types';
import { itemNameMap } from 'oldschooljs/dist/structures/Items';
import { fromKMB } from 'oldschooljs/dist/util';
import { Between, In, Not } from 'typeorm';

import { Events, PerkTier, SILENT_ERROR } from '../../lib/constants';
import { GuildSettings } from '../../lib/settings/types/GuildSettings';
import { UserSettings } from '../../lib/settings/types/UserSettings';
import { BotCommand } from '../../lib/structures/BotCommand';
import {
	GrandExchangeStatus,
	GrandExchangeTable,
	GrandExchangeType
} from '../../lib/typeorm/GrandExchangeTable.entity';
import {
	cleanString,
	formatItemStackQuantity,
	generateHexColorForCashStack,
	removeBankFromBank,
	stringMatches,
	toTitleCase
} from '../../lib/util';
import { canvasImageFromBuffer, canvasToBufferAsync, fillTextXTimesInCtx } from '../../lib/util/canvasUtil';
import chatHeadImage from '../../lib/util/chatHeadImage';
import getOSItem from '../../lib/util/getOSItem';
import getUsersPerkTier from '../../lib/util/getUsersPerkTier';

interface grandExchangeSlotsInterface {
	id: number;
	requirements?: PerkTier;
}

const grandExchangeSlots: grandExchangeSlotsInterface[] = [
	{ id: 1 },
	{ id: 2 },
	{
		id: 3,
		requirements: PerkTier.One
	},
	{ id: 4, requirements: PerkTier.Two },
	{ id: 5, requirements: PerkTier.Three },
	{ id: 6, requirements: PerkTier.Three },
	{ id: 7, requirements: PerkTier.Three },
	{ id: 8, requirements: PerkTier.Three }
];

export default class extends BotCommand {
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	private geInterface: Image | null = null;
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	private geInterfaceCollection: Image | null = null;
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	private geSlotLocked: Image | null = null;
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	private geSlotOpen: Image | null = null;
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	private geSlotActive: Image | null = null;
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	private geProgressShadow: Image | null = null;
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	private geProgressCollectionShadow: Image | null = null;
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	private geIconBuy: Image | null = null;
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	private geIconSell: Image | null = null;
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	private geCollectionSlot: Image | null = null;
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	private geCollectionSlotLocked: Image | null = null;

	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			cooldown: 1,
			usage: '[slots] [cmd:...string]',
			usageDelim: ' ',
			oneAtTime: true,
			subcommands: true
		});
	}

	async init() {
		await this.prepare();
	}

	async prepare() {
		this.geInterface = await canvasImageFromBuffer(
			fs.readFileSync('./src/lib/resources/images/grandexchange/ge_interface.png')
		);
		this.geSlotLocked = await canvasImageFromBuffer(
			fs.readFileSync('./src/lib/resources/images/grandexchange/ge_slot_locked.png')
		);
		this.geSlotOpen = await canvasImageFromBuffer(
			fs.readFileSync('./src/lib/resources/images/grandexchange/ge_slot_open.png')
		);
		this.geSlotActive = await canvasImageFromBuffer(
			fs.readFileSync('./src/lib/resources/images/grandexchange/ge_slot_active.png')
		);
		this.geProgressShadow = await canvasImageFromBuffer(
			fs.readFileSync('./src/lib/resources/images/grandexchange/ge_progress_shadow.png')
		);
		this.geProgressCollectionShadow = await canvasImageFromBuffer(
			fs.readFileSync('./src/lib/resources/images/grandexchange/ge_shadow_collection_progress.png')
		);
		this.geInterfaceCollection = await canvasImageFromBuffer(
			fs.readFileSync('./src/lib/resources/images/grandexchange/ge_interface_collection_box.png')
		);
		this.geIconBuy = await canvasImageFromBuffer(
			fs.readFileSync('./src/lib/resources/images/grandexchange/ge_buy_mini_icon.png')
		);
		this.geIconSell = await canvasImageFromBuffer(
			fs.readFileSync('./src/lib/resources/images/grandexchange/ge_sell_mini_icon.png')
		);
		this.geCollectionSlot = await canvasImageFromBuffer(
			fs.readFileSync('./src/lib/resources/images/grandexchange/ge_slot_collection.png')
		);
		this.geCollectionSlotLocked = await canvasImageFromBuffer(
			fs.readFileSync('./src/lib/resources/images/grandexchange/ge_slot_collection.png')
		);
	}

	prefix(msg: KlasaMessage) {
		return msg.guild ? msg.guild.settings.get(GuildSettings.Prefix) : this.client.options.prefix;
	}

	async invalidCommand(msg: KlasaMessage) {
		const prefix = this.prefix(msg);
		return this.clerkChat(
			msg,
			`I am sorry, but I didn't understood that. Use commands like this: "${prefix}ge sell 2 blessed spirit shield 500K" or like this "${prefix}ge buy 1000 raw shark 700". You can use "${prefix}ge help" for more information.`
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

	drawText(
		ctx: CanvasRenderingContext2D,
		text: string,
		x: number,
		y: number,
		maxWidth: number | undefined = undefined,
		lineHeight: number
	) {
		// If max width is set, we have to line break the text
		const textLines = [];
		const measuredText = ctx.measureText(text);
		if (maxWidth && measuredText.width > maxWidth) {
			const explodedText = text.split(' ');
			let newTextLine = '';
			for (const word of explodedText) {
				if (ctx.measureText(`${newTextLine} ${word}`).width >= maxWidth) {
					textLines.push(newTextLine);
					newTextLine = word;
				} else {
					newTextLine += ` ${word}`;
				}
			}
			textLines.push(newTextLine);
		}
		for (const [index, textLine] of (textLines.length ? textLines : [text]).entries()) {
			const textColor = ctx.fillStyle === '#000000' ? '#ff981f' : ctx.fillStyle;
			ctx.fillStyle = '#000000';
			fillTextXTimesInCtx(ctx, textLine.trim(), x + 1, y + lineHeight * index + 1);
			ctx.fillStyle = textColor;
			fillTextXTimesInCtx(ctx, textLine.trim(), x, y + lineHeight * index);
		}
	}

	async getSlotImage(
		ctx: CanvasRenderingContext2D,
		slot: number,
		slotData: GrandExchangeTable | undefined,
		collection: boolean = false,
		locked: boolean = false
	) {
		console.log(slot, locked);
		const slotImage = collection
			? locked
				? this.geCollectionSlotLocked!
				: this.geCollectionSlot!
			: slotData
			? this.geSlotActive!
			: locked
			? this.geSlotLocked!
			: this.geSlotOpen!;
		ctx.drawImage(slotImage, 0, 0, slotImage.width, slotImage.height);

		if (!collection) {
			// Draw Bank Title
			ctx.textAlign = 'center';
			ctx.font = '16px RuneScape Bold 12';
			let type = slotData ? ` - ${toTitleCase(slotData.type)}` : '';
			this.drawText(
				ctx,
				locked ? 'Locked' : `Slot ${slot}${type}`,
				Math.floor(slotImage.width / 2),
				17,
				undefined,
				10
			);
		}

		if (slotData) {
			let cashImage: Image | undefined = undefined;
			// Get item
			const itemImage = await this.client.tasks
				.get('bankImage')!
				.getItemImage(slotData.item, slotData?.quantity)
				.catch(() => {
					console.error(`Failed to load item image for item with id: ${slotData.item}`);
				});
			if (!itemImage) {
				this.client.emit(Events.Warn, `Item with ID[${slotData.item}] has no item image.`);
			}
			if (collection && slotData.collectionCash) {
				// Get cash
				cashImage = await this.client.tasks.get('bankImage')!.getItemImage(995, slotData.collectionCash);
				if (!cashImage) {
					this.client.emit(Events.Warn, 'Item with ID[995] has no item image.');
				}
			}
			// Draw item
			ctx.textAlign = 'left';
			ctx.font = '16px OSRSFontCompact';
			ctx.save();
			if (collection) {
				// Draw the small icon
				ctx.translate(81, 15);
				ctx.drawImage(
					itemImage,
					Math.floor((18 - itemImage!.width) / 2) + 2,
					Math.floor((18 - itemImage!.height) / 2),
					18,
					18
				);
				ctx.restore();
				ctx.save();
				ctx.translate(11, 32);
				// First collection slot (item being bought or cash if selling)
				if (slotData.collectionQuantity > 0) {
					ctx.drawImage(
						itemImage,
						Math.floor((32 - itemImage!.width) / 2) + 2,
						Math.floor((32 - itemImage!.height) / 2),
						itemImage!.width,
						itemImage!.height
					);
					if (slotData.collectionQuantity > 1) {
						const formattedQuantity = formatItemStackQuantity(slotData.collectionQuantity);
						ctx.fillStyle = generateHexColorForCashStack(slotData.collectionQuantity);
						this.drawText(ctx, formattedQuantity, 0, 9, undefined, 10);
					}
				}
				if (slotData.collectionCash > 0) {
					if (slotData.collectionQuantity > 0) {
						ctx.translate(45, 0);
					}
					ctx.drawImage(
						cashImage,
						Math.floor((32 - cashImage!.width) / 2) + 2,
						Math.floor((32 - cashImage!.height) / 2),
						cashImage!.width,
						cashImage!.height
					);
					const formattedQuantity = formatItemStackQuantity(slotData.collectionCash);
					ctx.fillStyle = generateHexColorForCashStack(slotData.collectionCash);
					this.drawText(ctx, formattedQuantity, 0, 9, undefined, 10);
				}
			} else {
				ctx.translate(8, 34);
				ctx.drawImage(
					itemImage,
					Math.floor((32 - itemImage!.width) / 2) + 2,
					Math.floor((32 - itemImage!.height) / 2),
					itemImage!.width,
					itemImage!.height
				);
				if (slotData.quantity > 1) {
					const formattedQuantity = formatItemStackQuantity(slotData.quantity);
					ctx.fillStyle = generateHexColorForCashStack(slotData.quantity);
					this.drawText(ctx, formattedQuantity, 0, 9, undefined, 10);
				}
				// Draw item name
				ctx.translate(39, 11);
				const itemName = getOSItem(slotData.item).name;
				ctx.fillStyle = '#FFB83F';
				ctx.font = '16px OSRSFontCompact';
				this.drawText(ctx, itemName, 0, 0, ctx.measureText('Elysian spirit').width, 10);
			}
			ctx.restore();

			if (collection) {
				// Draw icon
				const icon = slotData.type === 'sell' ? this.geIconSell! : this.geIconBuy!;
				ctx.save();
				ctx.translate(41, 2);
				ctx.drawImage(
					icon,
					Math.floor((32 - icon!.width) / 2) + 2,
					Math.floor((32 - icon!.height) / 2),
					icon!.width,
					icon!.height
				);
				ctx.restore();
			}

			if (!collection) {
				ctx.save();
				// Draw item value of the transaction
				ctx.translate(0, 87);
				ctx.font = '16px OSRSFontCompact';
				ctx.textAlign = 'center';

				ctx.fillStyle = '#ff981f';
				this.drawText(
					ctx,
					`${Number(slotData.price).toLocaleString()} coins`,
					Math.floor(this.geSlotOpen!.width / 2) + 1,
					17,
					undefined,
					10
				);
				ctx.restore();
			}
			// Draw progress bar
			const progressShadowImage = collection ? this.geProgressCollectionShadow! : this.geProgressShadow!;

			ctx.save();
			if (collection) ctx.translate(9, 9);
			else ctx.translate(5, 75);

			const maxWidth = progressShadowImage.width;
			ctx.fillStyle = '#ff981f';
			let progressWidth = 0;
			if (slotData.status !== GrandExchangeStatus.Canceled) {
				progressWidth = Math.floor((maxWidth * slotData.quantityTraded) / slotData.quantity);
				if (progressWidth === maxWidth) {
					ctx.fillStyle = '#005F00';
				}
			} else {
				ctx.fillStyle = '#8F0000';
				progressWidth = maxWidth;
			}
			ctx.fillRect(0, 0, progressWidth, progressShadowImage.height);
			ctx.drawImage(progressShadowImage, 0, 0, progressShadowImage.width, progressShadowImage.height);
			ctx.restore();
		}
	}

	getUserAvailableSlots(msg: KlasaMessage) {
		const slots: number[] = [];
		const userPerkTier = getUsersPerkTier(msg.author);
		for (const userSlot of grandExchangeSlots) {
			if (userSlot.requirements) {
				if (userPerkTier < userSlot.requirements) {
					continue;
				}
			}
			slots.push(userSlot.id);
		}
		return slots;
	}

	async createInterface(msg: KlasaMessage, slots: GrandExchangeTable[], collection: boolean = false) {
		const userAvailableSlots = this.getUserAvailableSlots(msg);
		const canvasImage = collection ? this.geInterfaceCollection! : this.geInterface!;
		const canvas = createCanvas(canvasImage.width, canvasImage.height);
		const ctx = canvas.getContext('2d');
		ctx.font = '16px OSRSFontCompact';
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(canvasImage, 0, 0, canvas.width, canvas.height);
		if (collection) ctx.translate(15, 44);
		else ctx.translate(9, 64);
		let y = 0;
		let x = 0;
		for (let i = 0; i < 8; i++) {
			if (i > 0 && i % 4 === 0) {
				y += (collection ? this.geCollectionSlot!.height : this.geSlotOpen!.height) + 10;
				x = 0;
			}
			ctx.save();
			ctx.translate(x * (collection ? this.geCollectionSlot!.width + 10 : this.geSlotOpen!.width + 2), y);
			await this.getSlotImage(
				ctx,
				i + 1,
				slots.find(s => s.slot === i + 1),
				collection,
				!userAvailableSlots.includes(i + 1)
			);
			ctx.restore();
			x++;
		}
		return canvasToBufferAsync(canvas, 'image/png');
	}

	async collectSlot(msg: KlasaMessage, slots: GrandExchangeTable[]) {
		try {
			const totalCollectedLoot = new Bank();
			let slotsCollected: number[] = [];
			for (const slot of slots) {
				const collectedItems = new Bank().add(995, slot.collectionCash).add(slot.item, slot.collectionQuantity);
				slot.collectionQuantity = 0;
				slot.collectionCash = 0;
				if (slot.quantityTraded === slot.quantity || slot.status === GrandExchangeStatus.Canceled) {
					slot.status = GrandExchangeStatus.Cleared;
				}
				await Promise.all([slot.save(), msg.author.addItemsToBank(collectedItems)]);
				totalCollectedLoot.add(collectedItems);
				slotsCollected.push(slot.slot);
			}
			return this.clerkChat(
				msg,
				`Here you go. These are the items that were on your collection box slot${
					slotsCollected.length > 1 ? 's' : ''
				} ${slotsCollected.join(', ')}: ${totalCollectedLoot}. Have a good day!`
			);
		} catch (e) {
			console.log(e);
			return this.clerkChat(msg, 'It was not possible to collect your offer at this time, please, try again.');
		}
	}

	async cancelSlot(msg: KlasaMessage, slots: GrandExchangeTable[]) {
		try {
			const totalCollectedLoot = new Bank();
			let slotsCollected: number[] = [];
			for (const slot of slots) {
				slot.status = GrandExchangeStatus.Canceled;
				if (slot.type === GrandExchangeType.Buy) {
					slot.collectionCash += (slot.quantity - slot.quantityTraded) * slot.price;
				} else {
					slot.collectionQuantity += slot.quantity - slot.quantityTraded;
				}
				const toCollect = new Bank().add(995, slot.collectionCash).add(slot.item, slot.collectionQuantity);
				await Promise.all([slot.save()]);
				totalCollectedLoot.add(toCollect);
				slotsCollected.push(slot.slot);
			}

			return this.clerkChat(
				msg,
				`Your transaction on the slot${slotsCollected.length > 1 ? 's' : ''} ${slotsCollected.join(
					', '
				)} have been canceled. ${
					totalCollectedLoot.items().length > 0
						? `The following items are available to be collect from this slot: ${totalCollectedLoot}`
						: ''
				} Have a good day!`
			);
		} catch (e) {
			console.log(e);
			return this.clerkChat(msg, 'It was not possible to cancel your offer at this time, please, try again.');
		}
	}

	async slots(msg: KlasaMessage, [cmd]: [string]) {
		await this.checkDms(msg);
		const prefix = this.prefix(msg);

		const userSlots = await GrandExchangeTable.find({
			where: [
				{
					userID: msg.author.id,
					status: In([
						GrandExchangeStatus.Completed,
						GrandExchangeStatus.Canceled,
						GrandExchangeStatus.Notified,
						GrandExchangeStatus.Running
					])
				}
			]
		});

		let clerkMessage:
			| string
			| false = `Here you go! These are the status of all your slots. You can find more about each slot by doing ${prefix}ge slots info 1, for example.`;
		let clerkOption = {};
		let collectView = false;

		if (cmd) {
			switch (cmd) {
				case 'collect':
				case 'cancel': {
					collectView = true;
					if (userSlots.length === 0) {
						clerkMessage = `I am sorry, but you have no available slots to ${
							cmd === 'collect' ? 'collect' : 'cancel'
						} at the moment.`;
					} else {
						clerkMessage = `Please, select the slot/slots you want to ${
							cmd === 'collect' ? 'collect' : 'cancel'
						} from the list below.`;
						clerkOption = {
							components: [
								[
									new MessageSelectMenu({
										type: 3,
										customID: 'slotSelect',
										options: userSlots.map(s => {
											return {
												label: `Slot ${s.slot} - ${toTitleCase(s.type)}`,
												value: `${s.id}`,
												description: `${toTitleCase(
													s.type
												)}ing ${s.quantity.toLocaleString()}x ${getOSItem(s.item).name}, ${(
													s.quantity - s.quantityTraded
												).toLocaleString()}x left.`
											};
										}),
										placeholder: 'Select a slot...',
										maxValues: userSlots.length,
										minValues: 1
									})
								]
							]
						};
					}
					break;
				}
				case 'cbox':
				case 'collection box':
				case 'collectionbox': {
					collectView = true;
					break;
				}
			}
		}

		const messageFiles = [];
		if (clerkMessage) {
			messageFiles.push(
				await chatHeadImage({
					content: clerkMessage,
					head: 'geClerk'
				})
			);
		}
		messageFiles.push(
			new MessageAttachment(
				await this.createInterface(msg, userSlots, collectView),
				`${msg.author.id}_GrandExchange_Slots_${new Date().toLocaleString()}.png`
			)
		);

		const messageOptions = {
			...clerkOption,
			files: messageFiles
		};

		const message = await msg.channel.send(messageOptions);

		let selectedSlots: string[] = [];

		if (Object.keys(clerkOption).length > 0) {
			try {
				const selection = await message.awaitMessageComponentInteraction({
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
				if (selection.customID === 'slotSelect') {
					// eslint-disable-next-line @typescript-eslint/ban-ts-comment
					// @ts-ignore
					selectedSlots = selection.values;
					await message.delete();
				}
			} catch (e) {
				await message.delete();
				await this.clerkChat(
					msg,
					'I am sorry, I got other people to attend. When you are ready to do some business, talk with me again.'
				);
				throw new Error(SILENT_ERROR);
			}

			const slots = selectedSlots.map(ss => {
				return userSlots.find(s => {
					return Number(s.id) === Number(ss);
				})!;
			});

			switch (cmd) {
				case 'cancel': {
					return this.cancelSlot(msg, slots);
				}
				case 'collect': {
					return this.collectSlot(msg, slots);
				}
			}
		}
		return message;
	}

	async run(msg: KlasaMessage, [cmd]: [string]) {
		await this.checkDms(msg);

		const prefix = this.prefix(msg);

		if (!cmd) {
			return this.slots(msg, ['slots']);
		}

		switch (cmd) {
			case 'collect': {
				return this.slots(msg, ['collect']);
			}
			case 'cancel': {
				return this.slots(msg, ['cancel']);
			}
			case 'cbox':
			case 'box': {
				return this.slots(msg, ['cbox']);
			}
		}

		const explodedCmd = cmd.split(' ');

		if (explodedCmd.length < 4) {
			return this.invalidCommand(msg);
		}

		// Get price per item
		const itemPrice = fromKMB(explodedCmd.pop()!);
		const type = explodedCmd.shift();
		const quantity = fromKMB(explodedCmd.shift()!);
		const item = explodedCmd.join(' ');
		let itemArray: Item[] = [];

		console.log(itemPrice, type, quantity, item);

		if (isNaN(itemPrice + quantity) || (type !== GrandExchangeType.Buy && type !== GrandExchangeType.Sell)) {
			return this.invalidCommand(msg);
		}

		const slotsInUse = await GrandExchangeTable.find({
			where: {
				userID: msg.author.id,
				slot: Between(1, 8),
				status: Not(GrandExchangeStatus.Cleared)
			}
		});

		let slot = 0;
		const userPerkTier = getUsersPerkTier(msg.author);
		for (const userSlot of grandExchangeSlots) {
			if (slotsInUse.some(s => s.slot === userSlot.id)) continue;
			if (userSlot.requirements) {
				if (userPerkTier < userSlot.requirements) {
					continue;
				}
			}
			slot = userSlot.id;
		}

		if (!slot || slot === 0) {
			return this.clerkChat(
				msg,
				`You dont have any free trading slot to use. Please, check ${prefix}ge to collect/cancel your active slots.`
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

			if (itemArray.length > 1) {
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

		if (!msg.flagArgs.cf) {
			channelMessage = await this.clerkChat(
				msg,
				`Are you sure you want to ${type} ${quantity.toLocaleString()}x ${
					selectedItem.name
				} for ${totalPrice.toLocaleString()} GP (${itemPrice.toLocaleString()} GP each)? The recommended price for this is item is ${selectedItem.price.toLocaleString()} GP.`,
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
			table.status = GrandExchangeStatus.Running;
			await table.save();

			if (type === GrandExchangeType.Buy) {
				await msg.author.removeGP(itemPrice * quantity);
				return this.clerkChat(
					msg,
					`Congratulations! Your trade offer for ${quantity}x ${selectedItem.name} was sucessfully added to our system! We'll notify you as soon as the trade is completed. Have a great day!`
				);
			}
			await msg.author.settings.update(
				UserSettings.Bank,
				removeBankFromBank(
					msg.author.settings.get(UserSettings.Bank),
					new Bank().add(selectedItem.id, quantity).bank
				)
			);
			return this.clerkChat(
				msg,
				`Congratulations! Your sell offer for ${quantity}x ${selectedItem.name} was sucessfully added to our system! We'll notify you as soon as the sale is completed. Have a great day!`
			);
		} catch (e) {
			console.log(e);
			return this.clerkChat(
				msg,
				'I am sorry, something went wrong while I was trying to make this transaction go forward. Could you try again in a few moments?'
			);
		}
	}
}
