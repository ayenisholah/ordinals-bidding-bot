import axiosInstance from "../axios/axiosInstance"

export async function collectionDetails(collectionSymbol: string, api_key: string) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-NFT-API-Key': api_key,
    }
    const url = `https://nfttools.pro/magiceden/v2/ord/btc/stat?collectionSymbol=${collectionSymbol}`
    const { data } = await axiosInstance.get<CollectionData>(url, { headers })

    return data

  } catch (error) {
    console.log(error);
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