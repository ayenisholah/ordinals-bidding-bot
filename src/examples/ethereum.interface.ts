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
    '1day': number;
    '7day': number;
    '30day': number;
    allTime: number;
  };
  volume: {
    '1day': number;
    '7day': number;
    '30day': number;
    allTime: number;
  };
  volumeChange: {
    '1day': number;
    '7day': number;
    '30day': number;
  };
  floorSale: {
    '1day': number;
    '7day': number;
    '30day': number;
  };
  floorSaleChange: {
    '1day': number;
    '7day': number;
    '30day': number;
  };
  salesCount: {
    '1day': string;
    '7day': string;
    '30day': string;
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