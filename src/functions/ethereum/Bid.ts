import { ethers } from "ethers";
import axiosInstance from "../../axios/axiosInstance";
import limiter from "../../bottleneck";
import { config } from "dotenv"
import { CancelRequest } from "./interface/cancel.interface";
import { log } from "console";
config()

const X_NFT_API_KEY = process.env.API_KEY as string


const headers = {
  'Content-Type': 'application/json',
  "X-NFT-API-Key": X_NFT_API_KEY,

}

export async function createOffer(
  maker: string,
  collection: string,
  quantity: number,
  weiPrice: string,
  expirationTime: string
) {
  const data = {
    maker: maker,
    source: "magiceden.io",
    params: [
      {
        collection: collection,
        currency: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        quantity: quantity,
        weiPrice: weiPrice,
        expirationTime: expirationTime,
        orderKind: "payment-processor-v2",
        orderbook: "reservoir",
        options: {
          "payment-processor-v2": {
            useOffChainCancellation: true
          }
        },
        automatedRoyalties: true
      }
    ]
  };

  try {
    const { data: order } = await limiter.schedule(() => axiosInstance.post<CreateOrderData>('https://nfttools.pro/magiceden/v3/rtp/ethereum/execute/bid/v5', data, { headers }))

    return order
  } catch (error: any) {
    console.log(error.response.data);

  }
}

export async function submitSignedOrderData(order: CreateOrderData, wallet: ethers.Wallet) {

  const signData: any = order?.steps
    ?.find((step) => step.id === "order-signature")
    ?.items?.[0]?.data?.sign;

  if (signData) {
    const signature = await wallet._signTypedData(
      signData.domain,
      signData?.types,
      signData.value
    );
    const payload = signData.value;
    const { buyer, ...rest } = payload;

    const data = {
      items: [
        {
          order: {
            kind: "payment-processor-v2",
            data: {
              kind: "collection-offer-approval",
              sellerOrBuyer: buyer,
              ...rest,
              r: "0x0000000000000000000000000000000000000000000000000000000000000000",
              s: "0x0000000000000000000000000000000000000000000000000000000000000000",
              v: 0,
            },
          },
          orderbook: "reservoir",
        },
      ],
      source: "magiceden.io",
    };


    const signEndpoint =
      "https://nfttools.pro/magiceden/v3/rtp/ethereum/order/v4";


    try {
      const { data: offerResponse } = await limiter.schedule(() =>
        axiosInstance.post<OfferResponse>(
          `${signEndpoint}?signature=${encodeURIComponent(signature)}`,
          data,
          { headers }
        )
      );

      console.log(JSON.stringify(offerResponse));
      return offerResponse

    } catch (error) {
      console.log(error);
    }
  }

}

export async function createCollectionOffer(maker: string,
  collection: string,
  quantity: number,
  weiPrice: string,
  expirationTime: string,
  wallet: ethers.Wallet
) {
  try {
    const order = await createOffer(maker, collection, quantity, weiPrice, expirationTime)

    if (order) {
      const res = await submitSignedOrderData(order, wallet)
      return res
    }
  } catch (error) {
    console.log(error);
  }
}

export async function getHighestOffer(contractAddress: string, slug: string) {
  const url = 'https://nfttools.pro/magiceden/v3/rtp/ethereum/orders/bids/v6';
  const params = {
    collection: contractAddress,
    sortBy: 'price',
    status: 'active',
    excludeEOA: 'false',
    includeCriteriaMetadata: 'true',
    includeDepth: 'true',
    normalizeRoyalties: 'false'
  };

  try {
    const { data } = await limiter.schedule(() => axiosInstance.get<OrdersResponse>(url, { params, headers: headers }))
    const orders = data.orders
      .map((item) => {
        const quantity = item.quantityFilled + item.quantityRemaining
        return { createdAt: item.createdAt, maker: item.maker, amount: (+item.price.amount.raw) / 1e18, netAmount: (+item.price.netAmount.raw) / 1e18, quantity }
      })
      .filter((item) => item.quantity > 999)


    if (orders.length) {
      console.log('-------------------------------------------------');
      console.log(`HIGHEST OFFERS ${slug}`);
      console.table(orders)
      console.log('-------------------------------------------------');
    }

    return data.orders.filter((item) => item.quantityFilled + item.quantityRemaining > 999)

  } catch (error) {
    return []
  }
}

export async function fetchOrderData(maker: string) {
  const url = 'https://nfttools.pro/magiceden/v3/rtp/ethereum/orders/bids/v6';
  const params = {
    maker: maker,
    includeCriteriaMetadata: 'true',
    orderType: 'collection',
    status: 'valid',
    normalizeRoyalties: 'false'
  };

  try {
    const { data } = await limiter.schedule(() => axiosInstance.get<OrdersResponse>(url, { params, headers: headers }))
    return data.orders
  } catch (error) {
    console.log(error);
  }
}

export async function orderCancelRequest(orderIds: string[]) {
  try {
    const url = "https://nfttools.pro/magiceden/v3/rtp/ethereum/execute/cancel/v3"

    const data = {
      orderIds: orderIds
    }
    const { data: order } = await limiter.schedule(() => axiosInstance.post<CancelRequest>(url, data, { headers }))

    return order

  } catch (error: any) {
    console.log(error.response.data);
  }
}

export async function submitCancelRequest(order: CancelRequest,
  offerIds: string[], wallet: ethers.Wallet) {

  try {
    if (order) {
      const signData: any = order.steps[0].items[0].data.sign;
      const signature = await wallet._signTypedData(
        signData.domain,
        signData.types,
        signData.value
      );

      console.log('--------------------------------------------');
      console.log(`CANCEL OFFER ${offerIds[0]}`);
      console.log('--------------------------------------------');

      const url = `https://nfttools.pro/magiceden/v3/rtp/ethereum/execute/cancel-signature/v1?signature=${encodeURIComponent(signature)}`

      const data = {
        "orderIds": offerIds,
        "orderKind": "payment-processor-v2"
      }

      const cancelResponse = await limiter.schedule(() => axiosInstance.post(url, data,
        { headers }))

      return cancelResponse
    }
  } catch (error: any) {
    console.log(error);
  }

}

export async function cancelRequest(orderIds: string[], wallet: ethers.Wallet) {
  try {
    const order = await orderCancelRequest(orderIds)
    if (order) {
      const response = await submitCancelRequest(order, orderIds, wallet)
      return response
    }
  } catch (error) {
    console.log(error);
  }
}



// https://api-mainnet.magiceden.io/v3/rtp/ethereum/execute/cancel-signature/v1?signature=0xc93f8c6751734ecc5bc07562d8e21e8fcaad29e6ca0b1c39cfc9023b78aab24361e93ea95cfef0615e4ecf052920b81e73d33ed5fa895235c7d69b70007242c51b



// submit signature

// https://api-mainnet.magiceden.io/v3/rtp/ethereum/execute/cancel-signature/v1?signature=0xc93f8c6751734ecc5bc07562d8e21e8fcaad29e6ca0b1c39cfc9023b78aab24361e93ea95cfef0615e4ecf052920b81e73d33ed5fa895235c7d69b70007242c51b


// {"orderIds":["0x4f6b030ecc633c51703315ec16e5547ddd7a135ddaba350bddbdef037b50d2ac"],"orderKind":"payment-processor-v2"}



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

interface NetAmount {
  raw: string;
  decimal: number;
  usd: number;
  native: number;
}

interface Price {
  currency: Currency;
  amount: Amount;
  netAmount: NetAmount;
}

interface CollectionData {
  id: string;
  name: string;
  image: string;
}

interface CriteriaData {
  collection: CollectionData;
}

interface Criteria {
  kind: string;
  data: CriteriaData;
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

interface OrdersResponse {
  orders: Order[];
}

interface CreateOrderData {
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
  chainId: number;
  verifyingContract: string;
}

interface Types {
  CollectionOfferApproval: CollectionOfferApproval[];
}

interface CollectionOfferApproval {
  name: string;
  type: string;
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

interface Post {
  endpoint: string;
  method: string;
  body: PostBody;
}

interface PostBody {
  items: PostItem[];
  source: string;
}

interface PostItem {
  order: Order;
  collection: string;
  isNonFlagged: boolean;
  orderbook: string;
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

// Example 

interface Result {
  message: string;
  orderIndex: number;
  orderId: string;
}

interface OfferResponse {
  results: Result[];
}

