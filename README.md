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

```
[
  	{
		"collectionSymbol": "fat_puppets",
		"minBid": 0.00002,
		"minFloorBid": 50,
		"maxFloorBid": 80,
		"maxBid": 0.00003,
		"bidCount": 10,
		"duration": 10,
		"scheduledLoop": 60,
		"counterbidLoop": 60,
		"outBidMargin": 1e-6,
		"fundingWalletWIF": "<WALLET PRIVATEKEY>",
		"receiverWallet": "bc1pad3xhdxnktqj4gch7t3kffsxcy6j5g94nq08k0gv8u62sd45xrhqucztsy"
	}
]
```

| Field            | Description                                                           |
| ---------------- | --------------------------------------------------------------------- |
| collectionSymbol | The symbol of the collection to bid on.                               |
| minBid           | The minimum bid amount.                                               |
| minFloorBid      | The minimum percentage of the floor price to bid.                     |
| maxFloorBid      | The maximum percentage of the floor price to bid.                     |
| maxBid           | The maximum bid amount.                                               |
| bidCount         | The number of bids to place.                                          |
| duration         | The duration of the bidding process.                                  |
| scheduledLoop    | The interval (in seconds) at which to run the scheduled bidding loop. |
| counterbidLoop   | The interval (in seconds) at which to run the counterbid loop.        |

`yarn bid`

#### Bulk cancel offers

`yarn cancel`
