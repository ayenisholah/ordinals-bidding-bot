import axiosInstance from "../axios/axiosInstance";
import * as bitcoin from "bitcoinjs-lib"
import { ECPairInterface, ECPairFactory, ECPairAPI, TinySecp256k1Interface } from 'ecpair';
import { config } from "dotenv"
import limiter from "../bottleneck";

const tinysecp: TinySecp256k1Interface = require('tiny-secp256k1');
const ECPair: ECPairAPI = ECPairFactory(tinysecp);
const network = bitcoin.networks.bitcoin;

config()

const api_key = process.env.API_KEY as string;
const private_key = process.env.PRIVATE_KEY as string;

const headers = {
  'Content-Type': 'application/json',
  'X-NFT-API-Key': api_key,
}


export async function createCollectionOffer(
  collectionSymbol: string,
  quantity: number,
  priceSats: number,
  expirationAt: string,
  feeSatsPerVbyte: number,
  makerPublicKey: string,
  makerReceiveAddress: string,
) {
  const params = {
    collectionSymbol,
    quantity,
    priceSats,
    expirationAt,
    feeSatsPerVbyte,
    makerPublicKey,
    makerPaymentType: 'p2wpkh',
    makerReceiveAddress
  };

  try {
    const url = 'https://nfttools.pro/magiceden/v2/ord/btc/collection-offers/psbt/create'

    console.log({ headers });

    const { data } = await limiter.schedule(() => axiosInstance.get<ICollectionOfferResponseData>(url, { params, headers }))

    console.log({ offers: data.offers, line: 49 });

    return data

  } catch (error: any) {
    console.log(error.response.data);
  }
}


// submit collection offer


export async function submitCollectionOffer(
  signedPsbtBase64: string,
  signedCancelPsbtBase64: string,
  collectionSymbol: string,
  quantity: number,
  priceSats: number,
  expirationAt: string,
  makerPublicKey: string,
  makerReceiveAddress: string
) {

  const requestData = {
    collectionSymbol,
    quantity,
    priceSats,
    expirationAt,
    makerPublicKey,
    makerPaymentType: 'p2wpkh',
    makerReceiveAddress,
    offers: [
      {
        signedPsbtBase64,
        signedCancelPsbtBase64
      }
    ]
  };

  const url = 'https://nfttools.pro/magiceden/v2/ord/btc/collection-offers/psbt/create'

  try {
    const { data } = await limiter.schedule(() => axiosInstance.post<ISubmitCollectionOfferResponse>(url, requestData, { headers }))
    return data

  } catch (error) {
    console.log(error);
  }
}
// sign collection offerData

export function signCollectionOffer(unsignedData: ICollectionOfferResponseData, privateKey: string) {

  console.log({ unsignedData, line: 103 });

  const offers = unsignedData.offers[0]

  console.log({ offers, line: 107 });


  const offerPsbt = bitcoin.Psbt.fromBase64(offers.psbtBase64);
  const cancelPsbt = bitcoin.Psbt.fromBase64(offers.cancelPsbtBase64);

  console.log({ offerPsbt, cancelPsbt, line: 113 });


  const keyPair: ECPairInterface = ECPair.fromWIF(privateKey, network)
  const toSignInputs = [1]

  for (let index of toSignInputs) {
    offerPsbt.signInput(index, keyPair);
    offerPsbt.finalizeInput(index);
    cancelPsbt.signInput(index, keyPair);
    cancelPsbt.finalizeInput(index);
  }

  offerPsbt.signAllInputs(keyPair)
  cancelPsbt.signAllInputs(keyPair)

  const signedOfferPSBTBase64 = offerPsbt.toBase64();
  const signedCancelledPSBTBase64 = cancelPsbt.toBase64();

  console.log({ signedOfferPSBTBase64, signedCancelledPSBTBase64 });

  return { signedOfferPSBTBase64, signedCancelledPSBTBase64 };
}

export async function createOffer(
  tokenId: string,
  price: number,
  expiration: number,
  buyerTokenReceiveAddress: string,
  buyerPaymentAddress: string,
  publicKey: string,
  feerateTier: string
) {
  const baseURL = 'https://nfttools.pro/magiceden/v2/ord/btc/offers/create';
  const params = {
    tokenId: tokenId,
    price: price,
    expirationDate: expiration,
    buyerTokenReceiveAddress: buyerTokenReceiveAddress,
    buyerPaymentAddress: buyerPaymentAddress,
    buyerPaymentPublicKey: publicKey,
    feerateTier: feerateTier
  };

  try {
    const { data } = await limiter.schedule(() => axiosInstance.get(baseURL, { params, headers }))
    return data
  } catch (error: any) {
    console.log("createOfferError: ", error.response.data);
  }
}

export function signData(unsignedData: any, privateKey: string) {
  if (typeof unsignedData !== "undefined") {
    const psbt = bitcoin.Psbt.fromBase64(unsignedData.psbtBase64);
    const keyPair: ECPairInterface = ECPair.fromWIF(privateKey, network)

    for (let index of unsignedData.toSignInputs) {
      psbt.signInput(index, keyPair);
      psbt.finalizeInput(index);
    }
    psbt.signAllInputs(keyPair)

    const signedBuyingPSBTBase64 = psbt.toBase64();
    return signedBuyingPSBTBase64;
  }
}


export async function submitSignedOfferOrder(
  signedPSBTBase64: string,
  tokenId: string,
  price: number,
  expiration: number,
  buyerPaymentAddress: string,
  buyerReceiveAddress: string,
  publicKey: string,
  feerateTier: string,
) {
  const url = 'https://nfttools.pro/magiceden/v2/ord/btc/offers/create'

  const data = {
    signedPSBTBase64: signedPSBTBase64,
    feerateTier: feerateTier,
    tokenId: tokenId,
    price: price,
    expirationDate: expiration.toString(),
    buyerPaymentAddress: buyerPaymentAddress,
    buyerPaymentPublicKey: publicKey,
    buyerReceiveAddress: buyerReceiveAddress
  };

  try {
    const response = await limiter.schedule(() => axiosInstance.post(url, data, { headers }))
    return response.data;
  } catch (error: any) {
    console.log(error.response.data);

  }
}

export async function getBestOffer(tokenId: string) {
  const url = 'https://nfttools.pro/magiceden/v2/ord/btc/offers/';
  const params = {
    status: 'valid',
    limit: 2,
    offset: 0,
    sortBy: 'priceDesc',
    token_id: tokenId
  };

  try {

    const { data } = await limiter.schedule(() => axiosInstance.get<OfferData>(url, { params, headers }));
    return data
  } catch (error: any) {
    console.log('getBestOffer: ', error.response);
  }
}


export async function cancelAllUserOffers(buyerTokenReceiveAddress: string, privateKey: string) {
  try {
    console.log('--------------------------------------------------------------------------------');
    console.log('CANCEL ALL OFFERS!!!');
    console.log('--------------------------------------------------------------------------------');

    const offerData = await getUserOffers(buyerTokenReceiveAddress)

    if (offerData && offerData.offers && offerData.offers.length > 0) {
      const offers = offerData.offers
      console.log('--------------------------------------------------------------------------------');
      console.log('NUMBER OF CURRENT ACTIVE OFFERS: ', offers.length);
      console.log('--------------------------------------------------------------------------------');

      for (const offer of offers) {
        const offerFormat = await retrieveCancelOfferFormat(offer.id)
        const signedOfferFormat = signData(offerFormat, privateKey)
        if (signedOfferFormat) {
          await submitCancelOfferData(offer.id, signedOfferFormat)

          console.log('--------------------------------------------------------------------------------');
          console.log(`CANCELLED OFFER FOR ${offer.token.collectionSymbol} ${offer.token.id}`);
          console.log('--------------------------------------------------------------------------------');

        }
      }
    }
  } catch (error) {
    console.log("cancelAllUserOffers: ", error);
  }
}

export async function cancelBulkTokenOffers(tokenIds: string[], buyerTokenReceiveAddress: string, privateKey: string) {
  try {
    for (const token of tokenIds) {
      const offerData = await getOffers(token, buyerTokenReceiveAddress)
      const offer = offerData?.offers[0]
      if (offer) {
        const offerFormat = await retrieveCancelOfferFormat(offer.id)
        const signedOfferFormat = signData(offerFormat, privateKey)

        if (signedOfferFormat) {
          await submitCancelOfferData(offer.id, signedOfferFormat)
          console.log('--------------------------------------------------------------------------------');
          console.log(`CANCELLED OFFER FOR ${offer.token.collectionSymbol} ${offer.token.id}`);
          console.log('--------------------------------------------------------------------------------');
        }
      }
    }
  } catch (error) {
    console.log('cancelBulkTokenOffers: ', error);
  }
}

export async function getOffers(tokenId: string, buyerTokenReceiveAddress?: string) {
  const url = 'https://nfttools.pro/magiceden/v2/ord/btc/offers/';

  let params: any = {
    status: 'valid',
    limit: 100,
    offset: 0,
    sortBy: 'priceDesc',
    token_id: tokenId
  };

  if (buyerTokenReceiveAddress) {
    params = {
      status: 'valid',
      limit: 1,
      offset: 0,
      sortBy: 'priceDesc',
      token_id: tokenId,
      wallet_address_buyer: buyerTokenReceiveAddress
    };
  }

  try {
    const { data } = await limiter.schedule(() => axiosInstance.get<OfferData>(url, { params, headers }))
    return data
  } catch (error: any) {
    console.log("getOffers ", error.response.data);
  }
}


export async function retrieveCancelOfferFormat(offerId: string) {
  const url = `https://nfttools.pro/magiceden/v2/ord/btc/offers/cancel?offerId=${offerId}`
  try {

    const { data } = await limiter.schedule({ priority: 5 }, () =>
      axiosInstance.get(url, { headers })
    );
    return data
  } catch (error: any) {
    // console.log("retrieveCancelOfferFormat: ", error.response.data.error);
  }
}

export async function submitCancelOfferData(offerId: string, signedPSBTBase64: string) {
  const url = 'https://nfttools.pro/magiceden/v2/ord/btc/offers/cancel';
  const data = {
    offerId: offerId,
    signedPSBTBase64: signedPSBTBase64
  };
  try {
    const response = await limiter.schedule(() => axiosInstance.post(url, data, { headers }))
    return response.data.ok
  } catch (error: any) {
    console.log('submitCancelOfferData: ', error.response.data);
  }
}

export async function counterBid(
  offerId: string,
  tokenId: string,
  price: number,
  expiration: number,
  buyerTokenReceiveAddress: string,
  buyerPaymentAddress: string,
  publicKey: string,
  feerateTier: string,
  privateKey: string
) {
  console.log('--------------------------------------------------------------------------------');
  console.log("COUNTER BID");
  console.log('--------------------------------------------------------------------------------');

  const cancelOfferFormat = await retrieveCancelOfferFormat(offerId)

  console.log('--------------------------------------------------------------------------------');
  console.log({ cancelOfferFormat });
  console.log('--------------------------------------------------------------------------------');

  const signedCancelOffer = signData(cancelOfferFormat, privateKey)

  console.log('--------------------------------------------------------------------------------');
  console.log({ signedCancelOffer });
  console.log('--------------------------------------------------------------------------------');

  if (signedCancelOffer) {
    const submitCancelOffer = await submitCancelOfferData(offerId, signedCancelOffer)

    console.log('--------------------------------------------------------------------------------');
    console.log({ submitCancelOffer });
    console.log('--------------------------------------------------------------------------------');

  }

  const unsignedOffer = await createOffer(tokenId, price, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, feerateTier)

  console.log('--------------------------------------------------------------------------------');
  console.log({ unsignedOffer });
  console.log('--------------------------------------------------------------------------------');

  const signedOfferData = signData(unsignedOffer, privateKey)

  console.log('--------------------------------------------------------------------------------');
  console.log({ signedOfferData });
  console.log('--------------------------------------------------------------------------------');

  if (signedOfferData) {

    const offerData = await submitSignedOfferOrder(signedOfferData, tokenId, price, expiration, buyerPaymentAddress, buyerTokenReceiveAddress, publicKey, feerateTier)

    console.log('--------------------------------------------------------------------------------');
    console.log({ offerData });
    console.log('--------------------------------------------------------------------------------');
  }

}

export async function getUserOffers(buyerPaymentAddress: string) {
  try {
    const url = 'https://nfttools.pro/magiceden/v2/ord/btc/offers/';
    const params = {
      status: 'valid',
      limit: 100,
      offset: 0,
      sortBy: 'priceDesc',
      wallet_address_buyer: buyerPaymentAddress.toLowerCase()
    };

    const { data } = await limiter.schedule(() => axiosInstance.get<UserOffer>(url, { params, headers }))
    return data
  } catch (error) {
    console.log('getUserOffers: ', error);
  }
}

interface Offer {
  id: string;
  tokenId: string;
  sellerReceiveAddress: string;
  sellerOrdinalsAddress: string;
  price: number;
  buyerReceiveAddress: string;
  buyerPaymentAddress: string;
  expirationDate: number;
  isValid: boolean;
  token: any;
}

interface OfferData {
  total: string;
  offers: Offer[];
}

interface Token {
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
  meta: {
    name: string;
    attributes: string[];
  };
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
  itemType: string;
  sat: number;
  satName: string;
  satRarity: string;
  satBlockHeight: number;
  satBlockTime: string;
  satributes: string[];
}

export interface IOffer {
  id: string;
  tokenId: string;
  sellerReceiveAddress: string;
  sellerOrdinalsAddress: string;
  price: number;
  buyerReceiveAddress: string;
  buyerPaymentAddress: string;
  expirationDate: number;
  isValid: boolean;
  token: Token;
}

interface UserOffer {
  total: string,
  offers: IOffer[]
}

export interface ICollectionOfferData {
  psbtBase64: string;
  transactionFeeSats: number;
  cancelPsbtBase64: string;
  cancelTransactionFeeSats: number;
}

export interface ICollectionOfferResponseData {
  offers: ICollectionOfferData[];
}

interface ISubmitCollectionOfferResponse {
  offerIds: string[];
}