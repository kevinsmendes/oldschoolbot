import { BaseEntity, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class BankTable extends BaseEntity {
	@PrimaryColumn({ type: 'varchar', length: 19 })
	public userId!: number;

	@PrimaryColumn({ type: 'int' })
	public itemId!: number;

	@Column({ type: 'int', default: 0 })
	public itemQty!: number;

	@Column({ type: 'int', default: 0 })
	public clQty!: number;

	@Column({ type: 'int', default: 0 })
	public sacrificedQty!: number;

	@Column({ type: 'int', nullable: true })
	public favorited!: number;

	@Column({ type: 'json', nullable: true })
	public itemMetadata!: any;
}
