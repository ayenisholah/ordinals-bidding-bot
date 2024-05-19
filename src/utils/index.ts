import { config } from "dotenv"
import axiosInstance from "../axios/axiosInstance";
import limiter from "../bottleneck";
import { Contract, Wallet, providers, utils } from "ethers";
import { WETH_ABI, WETH_ADDRESS } from "../constants/weth";

config()

const X_NFT_API_KEY = process.env.API_KEY;

export async function getBitcoinBalance(address: string): Promise<number | undefined> {
  try {
    const response = await limiter.schedule(() =>
      axiosInstance.get('https://nfttools.pro', {
        headers: {
          'url': `https://blockchain.info/q/addressbalance/${address}`,
          'x-nft-api-key': 'a4eae399-f135-4627-829a-18435bb631ae'
        }
      }));

    const balance = response.data;
    console.log('--------------------------------------------------------------------------------');
    console.log("BALANCE: ", balance);
    console.log('--------------------------------------------------------------------------------');

    return balance;
  } catch (error: any) {
    console.error('getBitcoinBalance:');
  }
}

export function convertEthToWei(ethAmount: string) {
  if (isNaN(parseFloat(ethAmount))) {
    throw new Error(
      "Invalid input: ethAmount must be a number or a numeric string."
    );
  }

  const ethString = ethAmount.toString();
  if (!ethString.match(/^\d+(\.\d+)?$/)) {
    throw new Error(
      "Invalid input format: ethAmount must be a decimal or integer number."
    );
  }

  const [integerPart, decimalPart = ""] = ethString.split(".");
  const paddedDecimalPart = decimalPart.padEnd(18, "0");
  const weiString = integerPart + paddedDecimalPart.slice(0, 18); // Ensure only up to 18 decimal places

  return BigInt(weiString).toString();
}

let initialFilteredNFTsCount: InitialFilteredNFTsCount = {};

export async function formatInitialStats(address: string, collectionSlugs: string[]) {
  const userNFTs: TokenOwnership[] = await fetchUserNFTs(address);

  let stats = "ME Diamond Farmin Bot Started - Current NFT Holdings:\n";

  collectionSlugs.forEach((slug) => {
    const filteredNFTs = filterNFTsByContract(userNFTs, slug);
    initialFilteredNFTsCount[slug] = filteredNFTs.length;

    stats += `Collection: ${slug}, Count: ${filteredNFTs.length}\n`;
  });

  return stats;
}

export async function fetchUserNFTs(address: string) {

  const apiUrl = `https://nfttools.pro/magiceden/v3/rtp/ethereum/users/${address}/tokens/v9?includeLastSale=true&excludeSpam=true&limit=50&sortBy=acquiredAt&sortDirection=desc&onlyListed=false&normalizeRoyalties=false`;
  let headers = {
    "X-NFT-API-Key": X_NFT_API_KEY,
  };
  try {
    const { data } = await limiter.schedule(() =>
      axiosInstance.get(apiUrl, { headers })
    );
    const tokens: TokenOwnership[] = data.tokens;


    console.log(`User owned NFTs: ${tokens.length}`);
    return tokens;
  } catch (error) {
    console.error("Failed to user owned NFTs:", error);
    return [];
  }
}

export function filterNFTsByContract(nfts: TokenOwnership[], slug: string) {
  if (!nfts || nfts.length === 0) {
    console.log("No NFTs provided for filtering.");
    return [];
  }
  const filtered = nfts.filter(
    (nft) => nft.token && nft.token.collection.slug === slug
  );
  return filtered;
}

export async function getWETHBalance(privateKey: string) {
  try {
    const NETWORK = "mainnet"
    const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY as string;
    const provider = new providers.AlchemyProvider(NETWORK, ALCHEMY_API_KEY)
    const wallet = new Wallet(privateKey, provider);
    const wethContract = new Contract(WETH_ADDRESS, WETH_ABI, wallet);
    const balance = await wethContract.balanceOf(wallet.address);
    const wethBalance = +utils.formatEther(balance);
    return wethBalance;
  } catch (error) {
    console.log('error getting wetj balance', error);
    return 0
  }
}


interface Currency {
  contract: string;
  name: string;
  symbol: string;
  decimals: number;
}

interface Amount {
  raw: string;
  decimal: number;
  usd: number;
  native: number;
}

interface FloorAskPrice {
  currency: Currency;
  amount: Amount;
}

interface Royalty {
  bps: number;
  recipient: string;
}

interface Collection {
  id: string;
  name: string;
  slug: string;
  symbol: string;
  imageUrl: string;
  isSpam: boolean;
  isNsfw: boolean;
  metadataDisabled: boolean;
  openseaVerificationStatus: string;
  magicedenVerificationStatus: string | null;
  floorAskPrice: FloorAskPrice;
  royaltiesBps: number;
  royalties: Royalty[];
}

interface Price {
  currency: Currency;
  amount: Amount;
  netAmount?: Amount;
}

interface FeeBreakdown {
  kind: string;
  bps: number;
  recipient: string;
  rawAmount: string;
  source: string;
}

interface LastSale {
  orderSource: string | null;
  fillSource: string | null;
  timestamp: number;
  price: Price;
  netAmount?: Amount;
  marketplaceFeeBps: number;
  paidFullRoyalty: boolean;
  feeBreakdown: FeeBreakdown[];
}

interface Metadata {
  imageOriginal: string;
  imageMimeType: string;
  tokenURI: string;
}

interface Token {
  chainId: number;
  contract: string;
  tokenId: string;
  kind: string;
  name: string;
  image: string;
  imageSmall: string;
  imageLarge: string;
  metadata: Metadata;
  description: string | null;
  rarityScore: number;
  rarityRank: number;
  supply: string;
  remainingSupply: string;
  media: string | null;
  isFlagged: boolean;
  isSpam: boolean;
  isNsfw: boolean;
  metadataDisabled: boolean;
  lastFlagUpdate: string | null;
  lastFlagChange: string | null;
  collection: Collection;
  lastSale: LastSale;
  lastAppraisalValue: number;
}

interface FloorAsk {
  id: string | null;
  price: Amount | null;
  maker: string | null;
  kind: string | null;
  validFrom: number | null;
  validUntil: number | null;
  source: {
    id: string;
    domain: string;
    name: string;
    icon: string;
    url: string;
  } | null;
}

interface Ownership {
  tokenCount: string;
  onSaleCount: string;
  floorAsk: FloorAsk;
  acquiredAt: string;
}

interface TokenOwnership {
  token: Token;
  ownership: Ownership;
}
interface InitialFilteredNFTsCount {
  [key: string]: number;
}