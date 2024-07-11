import axios from "axios";
import { config } from "dotenv";
import web3 from '@solana/web3.js'

config()

const API_KEY = process.env.API_KEY as string;
const headers = {
  'Content-Type': 'application/json',
  'X-NFT-API-Key': API_KEY,
}

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY as string;
const rpcURL = `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`

const connection = new web3.Connection(
  rpcURL,
  'confirmed',
);

async function main() {
  try {

    executeList()
  } catch (error) {
    console.log(error);
  }
}

async function executeList() {
  try {

    const url = 'https://nfttools.pro/magiceden/v2/instructions/sell';
    const params = {
      seller: 'EfdC1uyq5gWqHQYxSENscwNZKY8k2z8CXkpmPRB7mn2N',
      auctionHouseAddress: 'E8cU1WiRWjanGxmn96ewBgk9vPTcL6AEZ1t6F6fkgUWe',
      tokenMint: '7kpQSvaSW5r4usqUHeqXCHK79zj4amadLdv1mpFpDiWR',
      tokenAccount: 'HLfiWCHHma8BJDHPLt1q65v2cA4UXQKEswPCT1rEbQi4',
      price: 1
    };
    const { data } = await axios.get(url, { params, headers })
    JSON.stringify(data)
    return data.tx.data
  } catch (error) {
    console.log(error);
  }
}

async function executeBid() {
  try {
    const params = {
      buyer: 'EfdC1uyq5gWqHQYxSENscwNZKY8k2z8CXkpmPRB7mn2N',
      auctionHouseAddress: 'E8cU1WiRWjanGxmn96ewBgk9vPTcL6AEZ1t6F6fkgUWe',
      tokenMint: '7kpQSvaSW5r4usqUHeqXCHK79zj4amadLdv1mpFpDiWR',
      price: 1
    };
    const url = 'https://nfttools.pro/magiceden/v2/instructions/buy'
    const { data } = await axios.get(url, { params, headers })
    console.log(JSON.stringify(data));
    return data
  } catch (error) {
    console.log(error);
  }
}

main()

// https://auth.magiceden.io/api/v0/sdk/c1314b5b-ece8-4b4f-a879-3894dda364e4/verify

// const response = {
//   "expiresAt": 1723102092,
//   "user": {
//     "id": "05db2604-f4bb-44ec-9590-45c4a3329643",
//     "projectEnvironmentId": "c1314b5b-ece8-4b4f-a879-3894dda364e4",
//     "verifiedCredentials": [
//       {
//         "address": "EfdC1uyq5gWqHQYxSENscwNZKY8k2z8CXkpmPRB7mn2N",
//         "chain": "solana",
//         "id": "5e75ab87-b476-4618-9736-dfd0400e26fd",
//         "name_service": {},
//         "public_identifier": "EfdC1uyq5gWqHQYxSENscwNZKY8k2z8CXkpmPRB7mn2N",
//         "wallet_name": "magicedensol",
//         "wallet_provider": "browserExtension",
//         "format": "blockchain",
//         "lastSelectedAt": "2024-07-05T09:26:48.571Z"
//       },
//       {
//         "address": "bc1p5rw87me62aftc3lgrqpq430gp3rp5wtj4atxz6pum2rmhjhvsk0sx73cgk",
//         "chain": "bip122",
//         "id": "cfe0e871-c157-4626-ab55-241b80d4f305",
//         "name_service": {},
//         "public_identifier": "bc1p5rw87me62aftc3lgrqpq430gp3rp5wtj4atxz6pum2rmhjhvsk0sx73cgk",
//         "wallet_name": "magicedenbtc",
//         "wallet_provider": "browserExtension",
//         "format": "blockchain",
//         "wallet_additional_addresses": [
//           {
//             "address": "bc1p5rw87me62aftc3lgrqpq430gp3rp5wtj4atxz6pum2rmhjhvsk0sx73cgk",
//             "publicKey": "7e114d228f2f3ed890ee0c0e8753285e496280633ad2d3f89b95e4db9e11d3b6",
//             "type": "ordinals"
//           },
//           {
//             "address": "bc1qq0gahtew0mpm58p0e3cjrvlvhlyqxru05zy4ew",
//             "publicKey": "0300db232186bd7de491b45d5e703d6aebaf926b0ce52d721640a9bd3f1f160752",
//             "type": "payment"
//           }
//         ],
//         "lastSelectedAt": "2024-07-09T07:28:12.632Z"
//       }
//     ],
//     "lastVerifiedCredentialId": "cfe0e871-c157-4626-ab55-241b80d4f305",
//     "sessionId": "a85fe79e-10a8-4f7c-911f-016d038be77c",
//     "firstVisit": "2024-06-07T15:35:39.991Z",
//     "lastVisit": "2024-07-09T07:28:12.623Z",
//     "newUser": false,
//     "metadata": {
//       "migrationId": "44270307-556c-431e-9915-c5a64d39034c",
//       "migrationRequestId": "7409cc51-f236-41df-b00a-f6cf8b40c8ac"
//     },
//     "mfaBackupCodeAcknowledgement": null,
//     "lists": [],
//     "missingFields": []
//   }
// }

