import axiosInstance from "../axios/axiosInstance"

const API_KEY = process.env.API_KEY as string;
const headers = {
  'Content-Type': 'application/json',
  'X-NFT-API-Key': API_KEY,
}

export async function collectionDetails(collectionSymbol: string) {
  try {
    const url = `https://nfttools.pro/magiceden/v2/ord/btc/stat?collectionSymbol=${collectionSymbol}`
    const { data } = await axiosInstance.get<CollectionData>(url, { headers })

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

    const { data: collections } = await axiosInstance.get(url, { params, headers })
    return collections
  } catch (error: any) {
    console.log(error.response);
    return []
  }
}