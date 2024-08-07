export interface CreateOrderData {
  steps: Step[];
  errors: any[];
}

interface Step {
  id: string;
  action: string;
  description: string;
  kind: string;
  items: Item[];
}

interface Item {
  status: string;
  data: ItemData;
  orderIndexes: number[];
}

interface ItemData {
  from?: string;
  to?: string;
  data?: string;
  value?: string;
  sign?: Sign;
  post?: Post;
}

interface Sign {
  signatureKind: string;
  domain: Domain;
  types: Types;
  value: Value;
  primaryType: string;
}

interface Domain {
  name: string;
  version: string;
  chainId: string;
  verifyingContract: string;
}

interface Post {
  endpoint: string;
  method: string;
  body: PostBody;
}

interface Types {
  CollectionOfferApproval: CollectionOfferApproval[];
}

interface Value {
  protocol: number;
  cosigner: string;
  buyer: string;
  beneficiary: string;
  marketplace: string;
  fallbackRoyaltyRecipient: string;
  paymentMethod: string;
  tokenAddress: string;
  amount: string;
  itemPrice: string;
  expiration: string;
  marketplaceFeeNumerator: string;
  nonce: string;
  masterNonce: string;
}

interface PostBody {
  items: PostItem[];
  source: string;
}

interface Order {
  kind: string;
  data: OrderData;
}

interface OrderData {
  kind: string;
  protocol: number;
  cosigner: string;
  sellerOrBuyer: string;
  marketplace: string;
  paymentMethod: string;
  tokenAddress: string;
  amount: string;
  itemPrice: string;
  expiration: string;
  marketplaceFeeNumerator: string;
  nonce: string;
  masterNonce: string;
  fallbackRoyaltyRecipient: string;
  beneficiary: string;
  v: number;
  r: string;
  s: string;
}


interface CollectionOfferApproval {
  name: string;
  type: string;
}
interface PostItem {
  order: Order;
  collection: string;
  isNonFlagged: boolean;
  orderbook: string;
}


export interface OfferResponse {
  errors?: any;
}


interface Collection {
  chainId: number;
  id: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  symbol: string;
  contractDeployedAt: string;
  image: string;
  banner: string;
  twitterUrl: string | null;
  discordUrl: string;
  externalUrl: string;
  twitterUsername: string;
  openseaVerificationStatus: string;
  magicedenVerificationStatus: string | null;
  description: string;
  metadataDisabled: boolean;
  isSpam: boolean;
  isNsfw: boolean;
  isMinting: boolean;
  sampleImages: string[];
  tokenCount: string;
  onSaleCount: string;
  primaryContract: string;
  tokenSetId: string;
  creator: string;
  isSharedContract: boolean;
  royalties: {
    recipient: string;
    breakdown: { bps: number; recipient: string }[];
    bps: number;
  };
  allRoyalties: {
    onchain: { bps: number; recipient: string }[];
    opensea: { bps: number; required: boolean; recipient: string }[];
  };
  floorAsk: {
    id: string;
    sourceDomain: string;
    price: {
      currency: {
        contract: string;
        name: string;
        symbol: string;
        decimals: number;
      };
      amount: {
        raw: string;
        decimal: number;
        usd: number;
        native: number;
      };
    };
    maker: string;
    validFrom: number;
    validUntil: number;
    token: {
      contract: string;
      tokenId: string;
      name: string;
      image: string;
    };
  };
  topBid: {
    id: string;
    sourceDomain: string;
    price: {
      currency: {
        contract: string;
        name: string;
        symbol: string;
        decimals: number;
      };
      amount: {
        raw: string;
        decimal: number;
        usd: number;
        native: number;
      };
      netAmount: {
        raw: string;
        decimal: number;
        usd: number;
        native: number;
      };
    };
    maker: string;
    validFrom: number;
    validUntil: number;
  };
  rank: {
    '"1day"': number;
    '"7day"': number;
    '"30day"': number;
    allTime: number;
  };
  volume: {
    '"1day"': number;
    '"7day"': number;
    '"30day"': number;
    allTime: number;
  };
  volumeChange: {
    '"1day"': number;
    '"7day"': number;
    '"30day"': number;
  };
  floorSale: {
    '"1day"': number;
    '"7day"': number;
    '"30day"': number;
  };
  floorSaleChange: {
    '"1day"': number;
    '"7day"': number;
    '"30day"': number;
  };
  salesCount: {
    '"1day"': string;
    '"7day"': string;
    '"30day"': string;
    allTime: string;
  };
  collectionBidSupported: boolean;
  ownerCount: number;
  contractKind: string;
  mintedTimestamp: string | null;
  mintStages: any[];
}

export interface FetchCollectionDetailsResponse {
  collections: Collection[];
  continuation: string;
}

interface Order {
  id: string;
  kind: string;
  side: string;
  status: string;
  tokenSetId: string;
  tokenSetSchemaHash: string;
  contract: string;
  contractKind: string;
  maker: string;
  taker: string;
  price: Price;
  validFrom: number;
  validUntil: number;
  quantityFilled: number;
  quantityRemaining: number;
  criteria: Criteria;
  source: Source;
  feeBps: number;
  feeBreakdown: FeeBreakdown[];
  expiration: number;
  isReservoir: boolean | null;
  createdAt: string;
  updatedAt: string;
  originatedAt: string | null;
  depth: Depth[];
}

interface Price {
  currency: Currency;
  amount: Amount;
  netAmount: Amount;
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

interface Criteria {
  kind: string;
  data: CriteriaData;
}

interface CriteriaData {
  collection: Collection;
}

interface Collection {
  id: string;
  name: string;
  image: string;
}

interface Source {
  id: string;
  domain: string;
  name: string;
  icon: string;
  url: string;
}

interface FeeBreakdown {
  kind: string;
  recipient: string;
  bps: number;
}

interface Depth {
  price: number;
  quantity: number;
}

export interface FetchEthereumCollectionBidsResponse {
  orders: Order[];
  continuation: string;
}

export interface EthereumActivityResponse {
  activities: EthereumActivity[];
  continuation: string;
}

interface EthereumActivity {
  type: string;
  fromAddress: string | null;
  toAddress: string | null;
  price: EthereumPrice;
  amount: number;
  timestamp: number;
  createdAt: string;
  contract: string;
  token: EthereumToken;
  collection: EthereumCollection;
  order: EthereumOrder;
}

interface EthereumPrice {
  currency: EthereumCurrency;
  amount: EthereumAmount;
}

interface EthereumCurrency {
  contract: string;
  name: string;
  symbol: string;
  decimals: number;
}

interface EthereumAmount {
  raw: string;
  decimal: number;
  usd: number;
  native: number;
}

interface EthereumToken {
  tokenId: string | null;
  isSpam: boolean;
  isNsfw: boolean;
  tokenName: string | null;
  tokenImage: string | null;
  rarityScore?: number;
  rarityRank?: number;
}

interface EthereumCollection {
  collectionId: string;
  isSpam: boolean;
  isNsfw: boolean;
  collectionName: string;
  collectionImage: string;
}

interface EthereumOrder {
  id: string;
  side: string;
  source: EthereumSource;
  criteria: EthereumCriteria;
}

interface EthereumSource {
  domain: string;
  name: string;
  icon: string;
}

interface EthereumCriteria {
  kind: string;
  data: EthereumCriteriaData;
}

interface EthereumCriteriaData {
  collection: EthereumCollectionData;
  token?: EthereumTokenData;
  attribute?: EthereumAttributeData;
}

interface EthereumCollectionData {
  id: string;
  name: string;
  image: string;
  isSpam: boolean;
  isNsfw: boolean;
}

interface EthereumTokenData {
  tokenId: string;
  name: string | null;
  image: string | null;
  isSpam: boolean;
  isNsfw: boolean;
}

interface EthereumAttributeData {
  key: string;
  value: string;
}

export interface EthereumUserCollection {
  collection: {
    id: string;
    slug: string;
    name: string;
    image: string;
    isSpam: boolean;
    banner: string;
    twitterUrl: string | null;
    discordUrl: string;
    externalUrl: string;
    twitterUsername: string;
    openseaVerificationStatus: string;
    description: string;
    metadataDisabled: boolean;
    sampleImages: string[];
    tokenCount: string;
    primaryContract: string;
    tokenSetId: string;
    floorAskPrice: {
      currency: {
        contract: string;
        name: string;
        symbol: string;
        decimals: number;
      };
      amount: {
        raw: string;
        decimal: number;
        usd: number;
        native: number;
      };
    };
    rank: {
      "1day": number | null;
      "7day": number | null;
      "30day": number | null;
      "allTime": number;
    };
    volume: {
      "1day": number;
      "7day": number;
      "30day": number;
      "allTime": number;
    };
    volumeChange: {
      "1day": number;
      "7day": number;
      "30day": number;
    };
    floorSale: {
      "1day": number;
      "7day": number;
      "30day": number;
    };
    contractKind: string;
  };
  ownership: {
    tokenCount: string;
    totalValue: number;
  };
}

export interface EthereumTokenResponse {
  tokens: Token[];
  continuation: string | null;
}

interface Token {
  token: TokenDetails;
  market: MarketDetails;
  media: MediaDetails;
}

interface TokenDetails {
  chainId: number;
  contract: string;
  tokenId: string;
  name: string;
  description: string;
  image: string;
  imageSmall: string;
  imageLarge: string;
  metadata: Metadata;
  media: string;
  kind: string;
  isFlagged: boolean;
  isSpam: boolean;
  isNsfw: boolean;
  metadataDisabled: boolean;
  lastFlagUpdate: string;
  lastFlagChange: string | null;
  supply: string;
  remainingSupply: string;
  rarity: number;
  rarityRank: number;
  collection: CollectionDetails;
  lastSale: LastSale | null;
  owner: string;
  mintedAt: string;
  createdAt: string;
  decimals: number | null;
  mintStages: any[]; // Update this to a more specific type if known
}

interface Metadata {
  imageOriginal: string;
  mediaOriginal: string;
  imageMimeType: string;
  mediaMimeType: string;
  tokenURI: string;
}

interface CollectionDetails {
  id: string;
  name: string;
  image: string;
  slug: string;
  symbol: string | null;
  creator: string;
  tokenCount: number;
  metadataDisabled: boolean;
  floorAskPrice: FloorAskPrice;
}

interface FloorAskPrice {
  currency: Currency;
  amount: Amount;
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

interface LastSale {
  orderSource: string | null;
  fillSource: string | null;
  timestamp: number;
  price: Price;
}

interface Price {
  currency: Currency;
  amount: Amount;
}

interface MarketDetails {
  floorAsk: FloorAsk;
  updatedAt: string;
}

interface FloorAsk {
  id: string;
  price: Price;
  maker: string;
  validFrom: number;
  validUntil: number;
  quantityFilled: string;
  quantityRemaining: string;
  source: Source;
}

interface Source {
  id: string;
  domain: string;
  name: string;
  icon: string;
}

interface MediaDetails {
  image: string;
  imageMimeType: string;
  animationUrl: string;
  animationMimeType: string;
  animationEnabled: boolean;
}

export interface UserAuthData {
  _id: string;
  walletAddress: string;
  tier: {
    tier: number;
    updatedAt: number;
    total_volume: number;
    sol_volume: number;
    boosted_volume: number;
    id: string;
  };
}

interface TokenMetadata {
  imageOriginal: string;
  imageMimeType: string;
  tokenURI: string;
}

interface Royalty {
  bps: number;
  recipient: string;
}

interface FeeBreakdown {
  kind: string;
  bps: number;
  recipient: string;
  rawAmount: string;
  source: string;
}

interface SaleInfo {
  orderSource?: any;
  fillSource?: any;
  timestamp: number;
  price: {
    currency: {
      contract: string;
      name: string;
      symbol: string;
      decimals: number;
    },
    amount: {
      raw: string;
      decimal: number;
      usd: number;
      native: number;
    },
    netAmount?: {
      raw: string;
      decimal: number;
      usd: number;
      native: number;
    }
  };
  marketplaceFeeBps: number;
  paidFullRoyalty?: any;
  feeBreakdown: FeeBreakdown[];
}

interface FloorAsk {
  id: string;
  //@ts-ignore
  price: {
    currency: {
      contract: string;
      name: string;
      symbol: string;
      decimals: number;
    },
    amount: {
      raw: string;
      decimal: number;
      usd: number;
      native: number;
    }
  };
  maker: string;
  validFrom: number;
  validUntil: number;
  source: {
    id: string;
    domain: string;
    name: string;
    icon: string;
    url: string;
  };
}

interface OwnershipInfo {
  tokenCount: string;
  onSaleCount: string;
  floorAsk: FloorAsk;
  acquiredAt: string;
}

interface MediaInfo {
  image: string;
  imageMimeType: string;
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
  metadata: TokenMetadata;
  description?: string;
  rarityScore: number;
  rarityRank: number;
  supply: string;
  remainingSupply: string;
  collection: {
    id: string;
    name: string;
    slug: string;
    symbol: string;
    contractDeployedAt: string;
    imageUrl: string;
    isSpam?: any;
    isNsfw?: any;
    metadataDisabled?: any;
    openseaVerificationStatus: string;
    tokenCount: string;
    floorAsk: FloorAsk;
    royaltiesBps: number;
    royalties: Royalty[];
  };
  lastSale: SaleInfo;
  floorAsk: FloorAsk;
  lastAppraisalValue: number;
  ownership: OwnershipInfo;
  //@ts-ignore
  media: MediaInfo;
}

export interface NFTData {
  tokens: {
    token: Token;
  }[];
  continuation: string | null
}