import axiosInstance from "../axios/axiosInstance"

export async function retrieveTokens(API_KEY: string, collectionSymbol: string, bidAll: boolean) {
  const headers = {
    'X-NFT-API-Key': API_KEY,
  }
  try {
    const url = `https://nfttools.pro/magiceden/v2/ord/btc/tokens`;

    const allTokens: ITokenData[] = [];
    let page = 0;
    let amount = 100;

    do {
      const params = {
        limit: 100,
        offset: page * 100,
        sortBy: 'priceAsc',
        minPrice: 0,
        maxPrice: 0,
        collectionSymbol: collectionSymbol,
        disablePendingTransactions: true
      };
      const { data } = await axiosInstance.get<IToken>(url, { params, headers });
      const tokens = data.tokens
      page = page + 1;
      amount = tokens.length;

      allTokens.push(...tokens);
      console.log({ totalTokens: allTokens.length, page, amount });
    } while (amount === 100 && bidAll === true);
    return allTokens.filter(item => item.listed === true)
  } catch (error: any) {
    console.log(error);
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
