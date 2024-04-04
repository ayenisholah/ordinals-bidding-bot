import Bottleneck from "bottleneck";
import axiosInstance from "../axios/axiosInstance"
import limiter from "../bottleneck";

const API_KEY = process.env.API_KEY as string;
const headers = {
  'Content-Type': 'application/json',
  'X-NFT-API-Key': API_KEY,
}

export async function collectionDetails(collectionSymbol: string) {
  try {
    const url = `https://nfttools.pro/magiceden/v2/ord/btc/stat?collectionSymbol=${collectionSymbol}`
    const { data } = await limiter.schedule(() => axiosInstance.get<CollectionData>(url, { headers }));

    return data

  } catch (error: any) {
    console.log(error.response);
  }
}

interface CollectionData {
  totalVolume: string;
  owners: string;
  supply: string;
  floorPrice: string;
  totalListed: string;
  pendingTransactions: string;
  inscriptionNumberMin: string;
  inscriptionNumberMax: string;
  symbol: string;
}
export async function fetchCollections(API_KEY: string) {
  try {
    const url = 'https://nfttools.pro/magiceden_stats/collection_stats/search/bitcoin';
    const params = {
      window: '7d',
      limit: 100,
      offset: 0,
      sort: 'volume',
      direction: 'desc',
      filter: JSON.stringify({
        timeWindow: '7d',
        collectionType: 'all',
        sortColumn: 'volume',
        sortDirection: 'desc',
        featuredCollection: false
      })
    };

    const { data: collections } = await limiter.schedule(() => axiosInstance.get(url, { params, headers }))
    return collections
  } catch (error: any) {
    console.log(error.response);
    return []
  }
}

export async function collectionActivity(collectionSymbol: string, bidCount: number = 20) {
  console.log('----------------------------------------------------------------------------');
  console.log(`POLLING FOR NEW OFFER ACTIVITIES FOR ${collectionSymbol}`);
  console.log('----------------------------------------------------------------------------');


  const url = 'https://nfttools.pro/magiceden/v2/ord/btc/activities';

  const limit = bidCount >= 20 ? bidCount : 20
  const params = {
    limit: limit,
    offset: 0,
    sortBy: 'priceDesc',
    collectionSymbol: collectionSymbol,
    kind: ['offer_placed']
  };

  try {
    const { data } = await limiter.schedule(() => axiosInstance.get<OfferData>(url, { params, headers }))
    return data
  } catch (error) {
    console.log(error);
  }
}

interface OfferData {
  activities: OfferPlaced[]
}

export interface Token {
  inscriptionNumber: string;
  contentURI: string;
  contentType: string;
  contentBody: any;
  contentPreviewURI: string;
  meta: object;
  satRarity: string;
  satBlockHeight: number;
  satBlockTime: string;
  domain: any;
}

interface Collection {
  symbol: string;
  name: string;
  imageURI: string;
  chain: string;
  labels: string[];
}

export interface OfferPlaced {
  kind: 'offer_placed' | 'list';
  tokenId: string;
  chain: 'btc';
  collectionSymbol: string;
  collection: Collection;
  token: Token;
  createdAt: string;
  tokenInscriptionNumber: number;
  listedPrice: number;
  oldLocation: string;
  oldOwner: string;
  newOwner: string;
  txValue: number;
  sellerPaymentReceiverAddress: string;
  buyerPaymentAddress: string;
  selectedFeeType: string;
}