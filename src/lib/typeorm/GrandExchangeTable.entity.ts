import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn, ValueTransformer } from 'typeorm';

export enum GrandExchangeStatus {
	Notified = 'notified', // other is completed and the user is notified
	Completed = 'completed', // order is completed (all items sold or bought)
	Canceled = 'canceled', // user cancels the trade
	Cleared = 'cleared', // Canceled orders that are collect changes to this
	Running = 'running' // order running
}

export enum GrandExchangeType {
	Buy = 'buy',
	Sell = 'sell'
}

export const bigint: ValueTransformer = {
	to: (entityValue: number) => entityValue,
	from: (databaseValue: string): number => parseInt(databaseValue, 10)
};

@Entity({ name: 'grandExchange' })
@Index(['dateAdded', 'item'])
@Index(['item', 'quantityTraded', 'quantity'])
export class GrandExchangeTable extends BaseEntity {
	@PrimaryGeneratedColumn('increment')
	public id!: string;

	@Column('varchar', { length: 19, name: 'user_id', nullable: false })
	public userID!: string;

	@Column('enum', { enum: GrandExchangeType, name: 'type', nullable: false })
	public type!: GrandExchangeType;

	@Column('integer', { name: 'slot', nullable: false })
	public slot!: number;

	@Index()
	@Column('timestamp without time zone', { name: 'date_added', nullable: false, default: new Date() })
	public dateAdded!: Date;

	@Index()
	@Column('integer', { name: 'item', nullable: false })
	public item!: number;

	@Column('integer', { name: 'quantity', nullable: false })
	public quantity!: number;

	// The amount of items in the slot collection box (total items received so far from the transaction)
	@Column('integer', { name: 'collection_quantity', nullable: false })
	public collectionQuantity!: number;

	// The amount of cash in the slot collection box (total cash received so far from the transaction)
	@Column('bigint', { name: 'collection_cash', nullable: false, transformer: [bigint] })
	public collectionCash!: number;

	@Column('integer', { name: 'quantity_traded', nullable: false })
	public quantityTraded!: number;

	// Price per item
	@Column('bigint', { name: 'price', nullable: false, transformer: [bigint] })
	public price!: number;

	@Column('enum', {
		enum: GrandExchangeStatus,
		name: 'status',
		nullable: false,
		default: GrandExchangeStatus.Running
	})
	public status!: GrandExchangeStatus;
}

@Entity({ name: 'grandExchangeHistory' })
@Index(['userBought', 'dateTransaction'])
@Index(['userSold', 'dateTransaction'])
@Index(['userBought', 'userSold', 'dateTransaction'])
export class GrandExchangeHistoryTable extends BaseEntity {
	@PrimaryGeneratedColumn('increment')
	public id!: string;

	@Column('varchar', { length: 19, name: 'user_bought', nullable: false })
	public userBought!: string;

	@Column('varchar', { length: 19, name: 'user_sold', nullable: false })
	public userSold!: string;

	@Column('timestamp without time zone', { name: 'date_transaction', nullable: false, default: new Date() })
	public dateTransaction!: Date;

	@Column('integer', { name: 'item', nullable: false })
	public item!: number;

	@Column('integer', { name: 'quantity', nullable: false })
	public quantity!: number;

	// Price per item traded
	@Column('bigint', { name: 'price', nullable: false, transformer: [bigint] })
	public price!: number;
}
