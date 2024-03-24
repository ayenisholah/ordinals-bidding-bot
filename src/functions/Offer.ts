import axiosInstance from "../axios/axiosInstance";
import * as bitcoin from "bitcoinjs-lib"
import { ECPairInterface, ECPairFactory, ECPairAPI, TinySecp256k1Interface } from 'ecpair';

const tinysecp: TinySecp256k1Interface = require('tiny-secp256k1');
const ECPair: ECPairAPI = ECPairFactory(tinysecp);
const network = bitcoin.networks.bitcoin; // or bitcoin.networks.testnet for testnet



export async function createOffer(tokenId: string, price: number, expiration: number, buyerTokenReceiveAddress: string,
  buyerPaymentAddress: string,

  publicKey: string, feerateTier: string, api_key: string) {
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

  const headers = {
    'Content-Type': 'application/json',
    'X-NFT-API-Key': api_key,
  }

  try {
    const { data } = await axiosInstance.get(baseURL, { params, headers })
    return data
  } catch (error: any) {
    console.log(error.response.data);
  }
}

export function signData(unsignedData: any, privateKey: string) {
  console.log('Signing data...');

  const psbt = bitcoin.Psbt.fromBase64(unsignedData.psbtBase64);
  const keyPair: ECPairInterface = ECPair.fromWIF(privateKey, network)

  const signedPSBTBase64 = psbt.signInput(1, keyPair).toBase64()

  return signedPSBTBase64;
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
  api_key: string
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

  const headers = {
    'Content-Type': 'application/json',
    'X-NFT-API-Key': api_key,
  }

  try {
    console.log('--------------------------------------------------------------------------------');
    console.log("SUBMITTING SIGNED OFFER .....");
    console.log('--------------------------------------------------------------------------------');


    const response = await axiosInstance.post(url, data, { headers });
    return response.data;
  } catch (error: any) {
    console.log(JSON.stringify(error.response.data));
  }
}

export async function getBestOffer(tokenId: string, api_key: string) {
  const url = 'https://nfttools.pro/magiceden/v2/ord/btc/offers/';
  const params = {
    status: 'valid',
    limit: 1,
    offset: 0,
    sortBy: 'priceDesc',
    token_id: tokenId
  };

  const headers = {
    'Content-Type': 'application/json',
    'X-NFT-API-Key': api_key,
  }

  try {
    const { data } = await axiosInstance.get<OfferData>(url, { params, headers })
    return data
  } catch (error: any) {
    console.log(error);
  }
}

export async function getOffers(tokenId: string, api_key: string) {
  const url = 'https://nfttools.pro/magiceden/v2/ord/btc/offers/';
  const params = {
    status: 'valid',
    limit: 100,
    offset: 0,
    sortBy: 'priceDesc',
    token_id: tokenId
  };
  const headers = {
    'Content-Type': 'application/json',
    'X-NFT-API-Key': api_key,
  }
  try {
    const { data } = await axiosInstance.get<OfferData>(url, { params, headers })

    return data

  } catch (error: any) {
    console.log(JSON.stringify(error.response.data));
  }
}

export async function retrieveCancelOfferFormat(offerId: string, api_key: string) {
  const url = `https://nfttools.pro/magiceden/v2/ord/btc/offers/cancel?offerId=${offerId}`

  const headers = {
    'Content-Type': 'application/json',
    'X-NFT-API-Key': api_key,
  }
  try {
    const { data } = await axiosInstance.get(url, { headers })
    return data
  } catch (error: any) {
    console.log(error.response.data);
  }
}

export async function submitCancelOfferData(offerId: string, signedPSBTBase64: string, api_key: string) {
  const headers = {
    'Content-Type': 'application/json',
    'X-NFT-API-Key': api_key,
  }
  const url = 'https://nfttools.pro/magiceden/v2/ord/btc/offers/cancel';
  const data = {
    offerId: offerId,
    signedPSBTBase64: signedPSBTBase64
  };
  try {
    const response = await axiosInstance.post(url, data, { headers })
    return response.data.ok
  } catch (error: any) {
    console.log(error.response.data);
  }
}

export async function counterBid(
  offerId: string,
  api_key: string,
  privateKey: string,
  tokenId: string,
  price: number,
  expiration: number,
  buyerTokenReceiveAddress: string,
  buyerPaymentAddress: string,
  publicKey: string,
  feerateTier: string
) {
  console.log('--------------------------------------------------------------------------------');
  console.log("COUNTER BID");
  console.log('--------------------------------------------------------------------------------');

  const cancelOfferFormat = await retrieveCancelOfferFormat(offerId, api_key)

  console.log('--------------------------------------------------------------------------------');
  console.log({ cancelOfferFormat });
  console.log('--------------------------------------------------------------------------------');

  const signedCancelOffer = signData(cancelOfferFormat, privateKey)

  console.log('--------------------------------------------------------------------------------');
  console.log({ signedCancelOffer });
  console.log('--------------------------------------------------------------------------------');
  const submitCancelOffer = await submitCancelOfferData(offerId, signedCancelOffer, api_key)

  console.log('--------------------------------------------------------------------------------');
  console.log({ submitCancelOffer });
  console.log('--------------------------------------------------------------------------------');

  const unsignedOffer = await createOffer(tokenId, price, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, feerateTier, api_key)

  console.log('--------------------------------------------------------------------------------');
  console.log({ unsignedOffer });
  console.log('--------------------------------------------------------------------------------');

  const signedOfferData = signData(unsignedOffer, privateKey)

  console.log('--------------------------------------------------------------------------------');
  console.log({ signedOfferData });
  console.log('--------------------------------------------------------------------------------');

  const offerData = await submitSignedOfferOrder(signedOfferData, tokenId, price, expiration, buyerPaymentAddress, buyerTokenReceiveAddress, publicKey, feerateTier, api_key)

  console.log('--------------------------------------------------------------------------------');
  console.log({ offerData });
  console.log('--------------------------------------------------------------------------------');
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
  token: any; // You can define a proper interface for token if needed
}

interface OfferData {
  total: string;
  offers: Offer[];
}

// bulk cancel 1 - day
// update database 
// trait bidding - 3 days
// polling - 3 days