## ORDINAL BIDDING BOT

#### Requirements

- node version 18+

#### Install dependencies

- yarn is recommended

`yarn install`

OR

`npm install`

#### Create Test Wallets

`yarn address -n <number of wallets you want to create defaults to 10>`

#### Create Offers

- Create env and set TOKEN_RECEIVE_ADDRESS

`cp .env.example .env`

- Edit the offer.csv files to put collections you want

`yarn offer -p <wallet private key> -a <NFT Tools api key> -l src/offer.csv`

#### Bulk cancel offers

`yarn cancel -p <wallet private key> -a <NFT Tools api key>`

#### Example of traits in JSON

`"[{""value"":""Mutant Operator"",""trait_type"":""Common Pieces""}]"`
