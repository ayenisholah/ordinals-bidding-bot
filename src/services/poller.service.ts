import axiosInstance from "../axios/axiosInstance";
import { counterBid, getBestOffer } from "../functions/Offer";
import Offer from "../models/offer.model";

// get all offers
// check if we have the highest
// check if the offer has expired
// if offer has expired counter bid
const DEFAULT_OFFER_EXPIRATION = 15
const LOOP = process.env.LOOP as string || DEFAULT_OFFER_EXPIRATION;
const interval = 1 * 60 * 1000

class Poller {
  private isPolling: boolean;
  private timeoutId: NodeJS.Timeout | null;

  constructor() {
    this.isPolling = false
    this.timeoutId = null;
  }
  async pollOffer(buyerPaymentAddress: string, buyerTokenReceiveAddress: string, outBidMargin: number): Promise<void> {
    try {
      const offers = await Offer.findAll({})
      for (const offer of offers) {
        const currentOffer = await getBestOffer(offer.id)
        const publicKey = offer.publicKey;

        if (currentOffer?.offers[0]?.buyerPaymentAddress === buyerPaymentAddress) {
          console.log('--------------------------------------------------------------------------------');
          console.log('YOU HAVE THE HIGHEST OFFER FOR THIS TOKEN');
          console.log('--------------------------------------------------------------------------------');
          continue
        } else {
          if (currentOffer && currentOffer.offers && currentOffer.offers.length > 0) {
            const tokenId = currentOffer.offers[0].tokenId
            let price = currentOffer.offers[0].price
            price = price * (1 + (outBidMargin / 100))
            const currentTime = new Date().getTime();
            const expiration = currentTime + (+LOOP * 60 * 1000);
            const feerateTier = 'halfHourFee'

            await counterBid(currentOffer.offers[0].id, tokenId, price, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, feerateTier)
          }
        }
      }
    } catch (error) {
      console.log(error);
    }

    this.timeoutId = setInterval(async () => {
      console.log('--------------------------------------------------------------------------------');
      console.log('POLLING OFFERS FOR NEW UPDATES');
      console.log('--------------------------------------------------------------------------------');
      await this.pollOffer(buyerPaymentAddress, buyerTokenReceiveAddress, outBidMargin);
    }, interval);

  }

  async pollTokens() { }

  stop(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.isPolling = false;
    console.log('Polling stopped.');
  }
}

export default Poller