import { config } from "dotenv"
import axiosInstance from "../axios/axiosInstance"
import { Trait, transformTrait } from "../utils/traits.utils";
import rateLimitedAxiosInstance from "../axios/axiosInstance";


config()

const API_KEY = process.env.API_KEY as string;
const headers = {
  'X-NFT-API-Key': API_KEY,
}

export async function retrieveTokens(collectionSymbol: string, bidCount: number) {

  try {
    const url = `https://nfttools.pro/magiceden/v2/ord/btc/tokens`;
    const params = {
      limit: bidCount,
      offset: 0,
      sortBy: 'priceAsc',
      minPrice: 0,
      maxPrice: 0,
      collectionSymbol: collectionSymbol,
      disablePendingTransactions: true
    };
    const { data } = await axiosInstance.get<IToken>(url, { params, headers });
    const tokens = data.tokens

    return tokens.filter(item => item.listed === true)
  } catch (error: any) {
    console.log(error.response.data);
    return []
  }
}

export async function getTokenByTraits(traits: Trait[] | Trait, collectionSymbol: string) {


  const traitsArray: Trait[] = Array.isArray(traits) ? traits : [traits]


  const transformedTraits = transformTrait(traitsArray)

  const transformedAttributes = {
    "attributes": transformedTraits
  }

  const params = {
    attributes: encodeURIComponent(JSON.stringify(transformedAttributes)),
    collectionSymbol: collectionSymbol,
    disablePendingTransactions: true,
    limit: 100,
    offset: 0,
    sortBy: 'priceAsc'
  };

  const url = 'https://nfttools.pro/magiceden/v2/ord/btc/attributes';

  try {
    const { data } = await rateLimitedAxiosInstance.get<IToken>(url, { params, headers });
    const tokens = data.tokens
    return tokens.filter(item => item.listed === true)
  } catch (error: any) {
    console.log(error.response.data);
    return []
  }
}

interface IToken {
  tokens: ITokenData[]
}

interface Attribute { }

interface Meta {
  name: string;
  attributes: Attribute[];
  high_res_img_url: string;
}


export interface ITokenData {
  id: string;
  contentURI: string;
  contentType: string;
  contentBody: string;
  contentPreviewURI: string;
  genesisTransaction: string;
  genesisTransactionBlockTime: string;
  genesisTransactionBlockHash: string;
  genesisTransactionBlockHeight: number;
  inscriptionNumber: number;
  chain: string;
  meta: Meta;
  location: string;
  locationBlockHeight: number;
  locationBlockTime: string;
  locationBlockHash: string;
  output: string;
  outputValue: number;
  owner: string;
  listed: boolean;
  listedAt: string;
  listedPrice: number;
  listedMakerFeeBp: number;
  listedSellerReceiveAddress: string;
  listedForMint: boolean;
  collectionSymbol: string;
  collection: object; // You may want to define a more specific type for `collection`
  itemType: string;
  sat: number;
  satName: string;
  satRarity: string;
  satBlockHeight: number;
  satBlockTime: string;
  satributes: any[]; // You may want to define a more specific type for `satributes`
}
