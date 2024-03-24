import axiosInstance from "../axios/axiosInstance";
import { counterBid, getBestOffer } from "../functions/Offer";
import Offer from "../models/offer.model";

// get all offers
// check if we have the highest
// check if the offer has expired
// if offer has expired counter bid


class Poller {
  private interval: number;
  private isPolling: boolean;
  private publicKey: string;
  private timeoutId: NodeJS.Timeout | null;

  constructor(interval: number, publicKey: string) {
    this.interval = interval
    this.publicKey = publicKey
    this.isPolling = false
    this.timeoutId = null;
  }

  async pollOffer(buyerPaymentAddress: string, buyerTokenReceiveAddress: string, outBidMargin: number): Promise<void> {
    try {
      const offers = await Offer.findAll({})
      for (const offer of offers) {
        const currentOffer = await getBestOffer(offer.id)

        if (currentOffer?.offers[0]?.buyerPaymentAddress === buyerPaymentAddress) {
          console.log('YOU HAVE THE HIGHEST OFFER FOR THIS TOKEN');
          continue
        } else {
          if (currentOffer && currentOffer.offers && currentOffer.offers.length > 0) {
            const tokenId = currentOffer.offers[0].tokenId
            let price = currentOffer.offers[0].price
            price = price * (1 + (outBidMargin / 100))
            const duration = 30 // MINUTES
            const currentTime = new Date().getTime();
            const expiration = currentTime + (duration * 60 * 1000);
            const feerateTier = 'halfHourFee'

            await counterBid(currentOffer.offers[0].id, tokenId, price, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, this.publicKey, feerateTier)
          }
        }
      }
    } catch (error) {
      console.log(error);
    }

    this.timeoutId = setTimeout(async () => {
      await this.pollOffer(buyerPaymentAddress, buyerTokenReceiveAddress, outBidMargin);
    }, this.interval);

  }

  stop(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.isPolling = false;
    console.log('Polling stopped.');
  }
}

export default Poller