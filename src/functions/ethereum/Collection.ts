import axiosInstance from "../../axios/axiosInstance";
import limiter from "../../bottleneck";
import { config } from "dotenv"

config()

const X_NFT_API_KEY = process.env.API_KEY as string;


export async function getCollectionData(collectionSlugs: string[]) {
  const baseUrl = "https://nfttools.pro/opensea/api/v2/collections/";
  const headers = {
    "X-NFT-API-Key": X_NFT_API_KEY,
  };
  let collectionData: ICollectionDataMap = {};

  await Promise.all(
    collectionSlugs.map(async (slug: string) => {
      try {
        const { data } = await limiter.schedule(() =>
          axiosInstance.get<ICollectionFee>(`${baseUrl}${slug}`, { headers })
        );


        const fees = data.fees || [];
        const unwantedRecipient = "0x0000a26b00c1f0df003000390027140000faa719";
        const totalFees = fees
          .filter(
            (fee) =>
              fee.recipient.toLowerCase() !== unwantedRecipient.toLowerCase()
          )
          .reduce((sum, fee) => sum + parseFloat(fee.fee.toString()), 0);

        collectionData[slug] = { fee: totalFees, contractAddress: data.contracts[0].address };
        // get the contract address

      } catch (error) {
        console.error(`Failed to retrieve fees for collection: ${slug}`, error);
        collectionData[slug] = { fee: null, contractAddress: undefined };
      }
    })
  );

  return collectionData;
}


interface ICollectionFee {
  collection: string;
  name: string;
  description: string;
  image_url: string;
  banner_image_url: string;
  owner: string;
  safelist_status: string;
  category: string;
  is_disabled: boolean;
  is_nsfw: boolean;
  trait_offers_enabled: boolean;
  collection_offers_enabled: boolean;
  opensea_url: string;
  project_url: string;
  wiki_url: string;
  discord_url: string;
  telegram_url: string;
  twitter_username: string;
  instagram_username: string;
  contracts: Contract[];
  editors: string[];
  fees: Fee[];
  rarity: Rarity;
  total_supply: number;
  created_date: string;
}

interface Contract {
  address: string;
  chain: string;
}

interface Fee {
  fee: number;
  recipient: string;
  required: boolean;
}

interface Rarity {
  strategy_id: string;
  strategy_version: string;
  calculated_at: string;
  max_rank: number;
  tokens_scored: number;
}

interface ICollectionDataMap {
  [key: string]: {
    fee: number | null;
    contractAddress: string | undefined
  }
}