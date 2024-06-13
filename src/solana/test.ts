import axiosInstance from "../axios/axiosInstance";
import { config } from "dotenv"

config()
const api_key = process.env.API_KEY as string;

const headers = {
  'Content-Type': 'application/json',
  'X-NFT-API-Key': api_key,
}


async function main() {
  fetchActivitiesByMintAddress();
}

main()

async function fetchListedNftsByCollectionSymbol() {
  const url = 'https://nfttools.pro/magiceden/idxv2/getListedNftsByCollectionSymbol';
  const params = {
    collectionSymbol: 'deez_nuts',
    onChainCollectionAddress: 'DEEZyno8D9RCCghEWkTNarZrCW7HvvWE9z64tiqvQKpH',
    direction: 2,
    field: 1,
    limit: 100,
    token22StandardFilter: 1,
    mode: 'all',
    agg: 3,
    compressionMode: 'both'
  };

  try {
    const { data } = await axiosInstance.get<FetchListedNftsByCollectionSymbol>(url, { params, headers });
    console.log({ result: data.results });
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

async function fetchActivitiesByMintAddress() {
  const url = 'https://nfttools.pro/magiceden/v2/activities';
  const params = {
    mintAddress: '4yswEm8sB8AvegQsHHRWRnotoh9chdkY8hYASuiJYWUS',
    activityTypes: '["sale","list","edit_list","mint"]',
    fetchRoyaltyConfig: true,
    enableSNS: true
  };

  try {
    const response = await axiosInstance.get(url, { params, headers });
    console.log(response.data);
  } catch (error) {
    console.error('Error fetching activities:', error);
  }
}



interface FetchListedNftsByCollectionSymbol {
  results: ListedNft[],
  result: string
}

interface ListedNft {
  isCompressed: boolean;
  isTradeable: boolean;
  tokenOwnershipStandard: string;
  mintAddress: string;
  supply: number;
  title: string;
  primarySaleHappened: boolean;
  updateAuthority: string;
  onChainCollection: OnChainCollection;
  sellerFeeBasisPoints: number;
  creators: Creator[];
  price: number;
  solPrice: SolPrice;
  escrowPubkey: string;
  img: string;
  attributes: Attribute[];
  properties: Properties;
  propertyCategory: string;
  animationURL: string;
  externalURL: string;
  content: string;
  collectionName: string;
  collectionTitle: string;
  owner: string;
  id: string;
  listingType: string;
  listingUpdatedAt: Timestamp;
  updatedAt: string;
  createdAt: string;
  tokenStandard: number;
}

interface OnChainCollection {
  key: string;
  verified: number;
  data: CollectionData;
}

interface CollectionData {
  name: string;
  image: string;
  description: string;
}

interface Creator {
  share: number;
  address: string;
  verified: boolean;
}

interface SolPrice {
  rawAmount: string;
  address: string;
  decimals: number;
}

interface Attribute {
  trait_type: string;
  value: string;
}

interface Properties {
  files: File[];
  category: string;
  creators: Creator[];
}

interface File {
  uri: string;
  type: string;
}

interface Timestamp {
  updatedAt: string;
  slot: number;
}


// SOLANA LIST

// https://api-mainnet.magiceden.io/v2/instructions/batch?q=%255B%257B%2522type%2522%253A%2522m3_sell%2522%252C%2522ins%2522%253A%257B%2522seller%2522%253A%2522EfdC1uyq5gWqHQYxSENscwNZKY8k2z8CXkpmPRB7mn2N%2522%252C%2522assetId%2522%253A%2522BAee9ofp2wFqPtP84Fp5NhBNFxER7dXG4fARi6bThUUq%2522%252C%2522price%2522%253A0.00119%252C%2522expiry%2522%253A-1%257D%257D%255D

const url = 'https://api-mainnet.magiceden.io/v2/tx/3DC65vK5jVq6UuAkACUCZyhSarPGGt3mPq5QL2pFWoR4UAFp4FiYbJtAX1ZjVgA9HZGFVPp4u5CWsQyEAbw1kU4W'

// https://api-mainnet.magiceden.io/v2/tx/upk8bSWwKTSXAQmqGJ8dyVM5WFqdHrV4AwJVPgMkz4JfjhPohF67WbU3zJY3R5ZeHH4uGVmjeei9Xg4jMHLk1Ty


// https://api-mainnet.magiceden.io/rpc/getCollectionsByOwner/EfdC1uyq5gWqHQYxSENscwNZKY8k2z8CXkpmPRB7mn2N?compressionMode=both&enableFloorWithFee=true