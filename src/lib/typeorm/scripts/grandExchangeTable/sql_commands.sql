-- FUNCTION: public.grandexchangetransactions("grandExchange")

-- DROP FUNCTION public.grandexchangetransactions("grandExchange");

CREATE OR REPLACE FUNCTION public.grandexchangetransactions(
	trade "grandExchange")
    RETURNS "grandExchange"
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL SAFE
AS $BODY$
declare
	transactionrow record;
	qtylefttotrade numeric;
	foundrowfinal boolean;
	tradefinal boolean;
	limitrow boolean;
	limittrade boolean;
	transactionquantity numeric;
	buyerreceivedcash numeric;
	rowlefttotrade numeric;
	userbought numeric;
	usersale numeric;
	boughtid numeric;
	soldid numeric;
	thislimitleft numeric;
	qtyRowNeeded numeric;
begin

	qtylefttotrade = trade.quantity - trade.quantity_traded;

	-- if for some reason this was called without need
	if qtylefttotrade = 0 then
		trade.status = 'completed';
		return trade;
	end if;

	select * into thislimitleft from grandExchangeUserItemLimit(trade.user_id, trade.item);

	-- use is trade limited
	if trade.type = 'buy' and thislimitleft = 0 then
		return trade;
	end if;

	for transactionrow in (
		select
			this.*,
			grandExchangeUserItemLimit(this.user_id, this.item) as limitleft
		from "grandExchange" as this
		left join public."grandExchangeLimitedUser" l on l.user_id = this.user_id and l.item = this.item
		where
			this.status = 'running'
			and this.item = trade.item
			and this.type <> trade.type
			and this.user_id <> trade.user_id
			and ( ( trade.type = 'sell' and this.price >= trade.price ) or ( trade.type = 'buy' and this.price <= trade.price ) )
			-- dont allow limited offers to enter this
			and ( (l.limited_until is null) or(l.limited_until < now()) )
		order by
			case when trade.type = 'sell' then this.price * -1 else this.price end, this.date_added asc
    ) loop

		-- define how much is needed for the transaction to end now
		qtyRowNeeded = qtylefttotrade;

		-- qty this record can trade
		rowlefttotrade = transactionrow.quantity - transactionrow.quantity_traded;

		-- if this record is a buy record and have more than its trade limit allows, set it to the limit and block the offer
		if transactionrow.type = 'buy' and rowlefttotrade <= qtylefttotrade and rowlefttotrade >= transactionrow.limitleft then
			rowlefttotrade = transactionrow.limitleft;
			limitrow = true;
		end if;

		-- same as above, but for the main trade being itered over
		if trade.type = 'buy' and qtylefttotrade <= rowlefttotrade and qtylefttotrade >= thislimitleft then
			qtylefttotrade = thislimitleft;
			limittrade = true;
		end if;

		-- check if trade is final
		-- substract this row with what is left from the main trade
		-- if less than 0, means there are too many itens in this row
		-- so we have to use only what is necessary
		-- if les than 0, it also means we can close the main trade
		if qtylefttotrade - rowlefttotrade <= 0 then
			transactionquantity = qtylefttotrade;
		-- now, if the trade is higher than 0, it means this trade will not be final
		-- but the row is, as it has less than what we need
		-- we will check if the quantity of the row is limited before saying it can be closed or not
		else
			transactionquantity = rowlefttotrade;
			qtylefttotrade = qtylefttotrade - rowlefttotrade;
		end if;

		-- check if the trade need to be completed
		if transactionquantity = qtyRowNeeded then
			tradefinal = true;
		end if;

		-- if it entered here, it means this row either has been limited or less/equal of what the main trade is asking
		-- if so, we check if this trade is a sell or if it was limited or not. a sell and not limited trades completes it
		if transactionrow.quantity - transactionrow.quantity_traded = transactionquantity then
			foundrowfinal = true;
		end if;

		if trade.type = 'sell' then
			boughtid = transactionrow.id;
			soldid = trade.id;
			userbought = transactionrow.user_id;
			usersale = trade.user_id;
			-- receives the buyer cash
			trade.collection_cash = trade.collection_cash + ( transactionquantity * transactionrow.price );
			-- defines how many items were sold
			trade.quantity_traded = trade.quantity_traded + transactionquantity;
			if tradefinal then
				trade.status = 'completed';
			end if;
			if transactionrow.price < transactionrow.price then
				buyerreceivedcash = transactionquantity * ( transactionrow.price - transactionrow.price );
			else
				buyerreceivedcash = 0;
			end if;
			if foundrowfinal then
				update "grandExchange"
				set status = 'completed',
				quantity_traded = quantity_traded + transactionquantity,
				collection_cash = buyerreceivedcash,
				collection_quantity = collection_quantity + transactionquantity
				where id = transactionrow.id;
			else
				update "grandExchange"
				set quantity_traded = quantity_traded + transactionquantity,
				collection_cash = buyerreceivedcash,
				collection_quantity = collection_quantity + transactionquantity
				where id = transactionrow.id;
			end if;
		else
			boughtid = trade.id;
			soldid = transactionrow.id;
			userbought = trade.user_id;
			usersale = transactionrow.user_id;
			-- receives the buyer cash
			trade.collection_quantity = trade.collection_quantity + transactionquantity;
			-- defines how many items were sold
			trade.quantity_traded = trade.quantity_traded + transactionquantity;

			if transactionrow.price < trade.price then
				buyerreceivedcash = transactionquantity * ( trade.price - transactionrow.price );
			else
				buyerreceivedcash = 0;
			end if;
			trade.collection_cash = trade.collection_cash + buyerreceivedcash;

			if tradefinal then
				trade.status = 'completed';
			end if;

			if foundrowfinal then
				update "grandExchange"
				set status = 'completed',
				quantity_traded = quantity_traded + transactionquantity,
				collection_cash = collection_cash + ( transactionquantity * transactionrow.price )
				where id = transactionrow.id;
			else
				update "grandExchange"
				set quantity_traded = quantity_traded + transactionquantity,
				collection_cash = collection_cash + ( transactionquantity * transactionrow.price )
				where id = transactionrow.id;
			end if;
		end if;

		if transactionquantity > 0 then
			insert into "grandExchangeHistory" (bought_transaction_id, sold_transaction_id, user_bought, user_sold, date_transaction, item, quantity, price)
			values (boughtid, soldid, userbought, usersale, current_timestamp, trade.item, transactionquantity, transactionrow.price);
		end if;

		if limitrow = true then
			insert into "grandExchangeLimitedUser"(user_id, item, limited_until)
			values (transactionrow.user_id, transactionrow.item, now() + interval '4' hour)
			on conflict (user_id, item) do update
			set limited_until = now() + interval '4' hour;
		end if;

		if limittrade = true then
			insert into "grandExchangeLimitedUser"(user_id, item, limited_until)
			values (trade.user_id, trade.item, now() + interval '4' hour)
			on conflict (user_id, item) do update
			set limited_until = now() + interval '4' hour;
		end if;

		exit when tradefinal = true or limittrade = true;

    end loop;

	return trade;

end;
$BODY$;

ALTER FUNCTION public.grandexchangetransactions("grandExchange")
    OWNER TO postgres;

-- FUNCTION: public.grandexchangeuseritemlimit(character varying, integer)

-- DROP FUNCTION public.grandexchangeuseritemlimit(character varying, integer);

CREATE OR REPLACE FUNCTION public.grandexchangeuseritemlimit(
	thisuser character varying,
	thisitem integer)
    RETURNS integer
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL SAFE
AS $BODY$
DECLARE
	quantity NUMERIC;
	itemLimit NUMERIC;
BEGIN

	select coalesce(sum(history.quantity),0) into quantity
	 from "grandExchangeHistory" history
	where history.user_bought = thisUser
	 and history.date_transaction >= now() - interval '4' hour
	 and history.item = thisItem;

	select coalesce(limits.value::jsonb::integer,0) into itemLimit
	from json_each((select "grandExchange.tradeLimit" from "clientStorage" limit 1)) limits
	where limits.key = thisItem::varchar;

	IF itemLimit - quantity > 0 THEN
		return itemLimit - quantity;
	ELSE
		return 0;
	END IF;

END;
$BODY$;

ALTER FUNCTION public.grandexchangeuseritemlimit(character varying, integer)
    OWNER TO postgres;

-- PROCEDURE: public.grandExchangeUpdateLimitedOffers()

-- DROP PROCEDURE public."grandExchangeUpdateLimitedOffers"();

CREATE OR REPLACE PROCEDURE public."grandExchangeUpdateLimitedOffers"(
	)
LANGUAGE 'plpgsql'
AS $BODY$
declare
	transactionrow "grandExchange";
	newrow record;
begin
	for transactionrow in
		select a.* from "grandExchange" a
		left join "grandExchange" b on b."type" = 'sell' and b.status = 'running' and a.item = b.item
		left join "grandExchangeLimitedUser" c on c.user_id = a.user_id and c.item = a.item
		where
			a.type = 'buy' and
			a.status = 'running' and
			( c.limited_until < now() or c.limited_until is null )
    loop

	select * into newrow from public.grandexchangetransactions(transactionrow);

	update "grandExchange"
	   set status = newrow.status,
		   collection_quantity = newrow.collection_quantity,
		   quantity_traded = newrow.quantity_traded,
		   collection_cash = newrow.collection_cash
	 where id = newrow.id;

    end loop;

end;
$BODY$;


-- FUNCTION: public.grandexchangetransactions()

-- DROP FUNCTION public.grandexchangetransactions();

CREATE FUNCTION public.grandexchangetransactions()
    RETURNS trigger
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE NOT LEAKPROOF
AS $BODY$
BEGIN
	NEW = public.grandexchangetransactions(NEW);
	RETURN NEW;
END;
$BODY$;

ALTER FUNCTION public.grandexchangetransactions()
    OWNER TO postgres;

-- Trigger: grandexchangetrigger

-- DROP TRIGGER grandexchangetrigger ON public."grandExchange";

CREATE TRIGGER grandexchangetrigger
    BEFORE INSERT
    ON public."grandExchange"
    FOR EACH ROW
    EXECUTE FUNCTION public.grandexchangetransactions();
