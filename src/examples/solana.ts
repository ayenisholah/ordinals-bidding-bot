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