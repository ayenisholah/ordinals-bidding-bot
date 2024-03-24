## ORDINAL BIDDING BOT

#### Requirements

- node version 18+

#### Install dependencies

- yarn is recommended

`yarn install`

OR

`npm install`

### COLLECTION SCANNER

`yarn scan:collections -a <NFT TOOLS API KEY>`

### ACCOUNT MANAGEMENT

#### Create Test Wallets

`yarn account:create`

#### Delete Wallets

`yarn account:destroy`

#### Create Offers

- Create env and set TOKEN_RECEIVE_ADDRESS

`cp .env.example .env`

- Edit the offer.csv files to put collections you want

`yarn offer -p <wallet private key> -a <NFT Tools api key> -l src/offer.csv`

You can spin up workers to make 4 concurrent bidding
`yarn start`

#### Bulk cancel offers

`yarn cancel -p <wallet private key> -a <NFT Tools api key>`

#### Example of traits in JSON

`"[{""value"":""Mutant Operator"",""trait_type"":""Common Pieces""}]"`
