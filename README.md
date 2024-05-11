## ORDINAL BIDDING BOT

#### Requirements

- node version 18+

#### Install dependencies

- yarn is recommended

`yarn install`

OR

`npm install`

### COLLECTION SCANNER

`yarn scan:collections`

### ACCOUNT MANAGEMENT (coming soon)

#### Create Test Wallets

`yarn account:create`

#### Delete Wallets

`yarn account:destroy`

#### Create Offers

- Set env variables

`cp .env.example .env`

- Edit the collections.json and set bidding configurations

### ITEM OFFER

| Field                           | Description                                                           |
| ------------------------------- | --------------------------------------------------------------------- |
| collectionSymbol                | The symbol of the collection to bid on.                               |
| minBid                          | The minimum bid amount.                                               |
| minFloorBid                     | The minimum percentage of the floor price to bid.                     |
| maxFloorBid                     | The maximum percentage of the floor price to bid.                     |
| maxBid                          | The maximum bid amount.                                               |
| bidCount                        | The number of bids to place.                                          |
| duration                        | The duration of the bidding process.                                  |
| scheduledLoop                   | The interval (in seconds) at which to run the scheduled bidding loop. |
| offerType (ITEM OR COLLECTION)  | Type of offer either item or collection or trait (coming soon)        |
| enableCounterBidding (OPTIONAL) | Enable / disable counter bidding                                      |
| fundingWalletWIF (OPTIONAL)     | WIF (Wallet Import Format). This overrides the value set in the env   |
| quantity (OPTIONAL)             | the maximum number of token to buy, default to 1                      |
| tokenReceiveAddress (OPTIONAL)  | Token receive address. This overrides the value set in the env        |

```
[
  	{
		"collectionSymbol": "bitdogs_btc",
		"minBid": 0.0015,
		"maxBid": 0.0019,
		"minFloorBid": 65,
		"maxFloorBid": 80,
		"bidCount": 7,
		"duration": 60,
		"enableCounterBidding": true,
		"scheduledLoop": 60,
		"outBidMargin": 1e-6,
		"offerType": "ITEM",
		"quantity": 1,
	}
]
```

### COLLECTION OFFER

| Field                           | Description                                                           |
| ------------------------------- | --------------------------------------------------------------------- |
| collectionSymbol                | The symbol of the collection to bid on.                               |
| minBid                          | The minimum bid amount.                                               |
| minFloorBid                     | The minimum percentage of the floor price to bid.                     |
| maxFloorBid                     | The maximum percentage of the floor price to bid.                     |
| maxBid                          | The maximum bid amount.                                               |
| bidCount                        | The number of bids to place.                                          |
| duration                        | The duration of the bidding process.                                  |
| scheduledLoop                   | The interval (in seconds) at which to run the scheduled bidding loop. |
| offerType (ITEM OR COLLECTION)  | Type of offer either item or collection or trait (coming soon)        |
| enableCounterBidding (OPTIONAL) | Enable / disable counter bidding                                      |
| fundingWalletWIF (OPTIONAL)     | WIF (Wallet Import Format). This overrides the value set in the env   |
| feeSatsPerVbyte (OPTIONAL)      | Network fees, default to 28                                           |
| tokenReceiveAddress (OPTIONAL)  | Token receive address. This overrides the value set in the env        |

```
[
  	{
		"collectionSymbol": "bitdogs_btc",
		"minBid": 0.0015,
		"maxBid": 0.0019,
		"minFloorBid": 65,
		"maxFloorBid": 80,
		"bidCount": 7,
		"duration": 60,
		"enableCounterBidding": true,
		"scheduledLoop": 60,
		"outBidMargin": 1e-6,
		"offerType": "COLLECTION",
		"quantity": 1,
		"feeSatsPerVbyte": 28
	}
]
```

`yarn bid`

#### Bulk cancel offers

`yarn cancel`
