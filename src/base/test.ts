import axiosInstance from "../axios/axiosInstance";
import { config } from "dotenv"

config()
const api_key = process.env.API_KEY as string;

const headers = {
  'Content-Type': 'application/json',
  'X-NFT-API-Key': api_key,
}



async function main() {
  fetchCollectionData()
}


main()


async function fetchTokenData() {
  const url = 'https://nfttools.pro/v3/rtp/base/tokens/v7';
  const params = {
    includeQuantity: true,
    includeLastSale: true,
    excludeSpam: true,
    excludeBurnt: true,
    collection: '0x9db39ac416c5ec75c2c3ae622d2013ecccc2d74a',
    sortBy: 'floorAskPrice',
    sortDirection: 'asc',
    limit: 50,
    includeAttributes: false,
    normalizeRoyalties: false
  };

  try {
    const response = await axiosInstance.get(url, { params, headers });
    console.log(response.data);
  } catch (error) {
    console.error('Error fetching token data:', error);
  }
}


async function fetchCollectionData() {
  const url = 'https://nfttools.pro/v3/rtp/base/collections/v7';
  const params = {
    id: '0x9db39ac416c5ec75c2c3ae622d2013ecccc2d74a',
    limit: 1,
    includeSalesCount: true,
    excludeSpam: true,
  };

  try {
    const response = await axiosInstance.get(url, { params, headers });
    console.log(response.data);
  } catch (error) {
    console.error('Error fetching collection data:', error);
  }
}

async function fetchCollectionStats() {
  const url = 'https://nfttools.pro/magiceden_stats/collection_stats/search/base';
  const params = {
    offset: 0,
    window: '6h',
    limit: 100,
    sort: 'sales',
    direction: 'desc',
    filter: '{}'
  };

  try {
    const response = await axiosInstance.get<CollectionStats[]>(url, { params, headers });
    console.log(response.data);
  } catch (error) {
    console.error('Error fetching collection stats:', error);
  }
}


interface CollectionStats {
  chain: string;
  name: string;
  collectionSymbol: string;
  collectionId: string;
  vol: number;
  totalVol: number;
  volPctChg: number;
  txns: number;
  txnsPctChg: number;
  fp: number;
  fpPctChg: number;
  fpListingPrice: number;
  fpListingCurrency: string;
  highestGlobalOfferBidCurrency: string;
  marketCap: number;
  totalSupply: number;
  listedCount: number;
  ownerCount: number;
  uniqueOwnerRatio: number;
  image: string;
  isCompressed: boolean;
  isVerified: boolean;
  hasInscriptions: boolean;
  currency: string;
  currencyUsdRate: number;
  marketCapUsd: number;
}