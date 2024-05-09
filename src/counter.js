const bestOffer = await getBestCollectionOffer(collectionSymbol);
if (bestOffer && bestOffer.offers.length > 0) {
	const [topOffer, secondTopOffer] = bestOffer.offers;
	const bestPrice = topOffer.price.amount;

	bidHistory[collectionSymbol].highestCollectionOffer = {
		price: bestPrice,
		buyerPaymentAddress: topOffer.btcParams.makerPaymentAddress,
	};

	const ourOffer = bestOffer.offers.find(
		(item) =>
			item.btcParams.makerPaymentAddress.toLowerCase() ===
			buyerPaymentAddress.toLowerCase()
	);
	if (topOffer.btcParams.makerPaymentAddress !== buyerPaymentAddress) {
		try {
			if (ourOffer) {
				const offerIds = [ourOffer.id];
				await cancelCollectionOffer(offerIds, publicKey, privateKey);
			}
		} catch (error) {
			console.log(error);
		}

		const currentPrice = topOffer.price.amount;
		const bidPrice = currentPrice + outBidMargin * CONVERSION_RATE;
		if (bidPrice <= maxOffer && bidPrice < floorPrice) {
			console.log(
				"-----------------------------------------------------------------------------------------------------------------------------"
			);
			console.log(
				`OUTBID CURRENT COLLECTION OFFER ${currentPrice} OUR OFFER ${bidPrice} FOR ${collectionSymbol}`
			);
			console.log(
				"-----------------------------------------------------------------------------------------------------------------------------"
			);

			try {
				await placeCollectionBid(
					bidPrice,
					expiration,
					collectionSymbol,
					buyerTokenReceiveAddress,
					publicKey,
					privateKey,
					feeSatsPerVbyte
				);
				bidHistory[collectionSymbol].offerType = "COLLECTION";

				bidHistory[collectionSymbol].highestCollectionOffer = {
					price: bidPrice,
					buyerPaymentAddress: buyerPaymentAddress,
				};
			} catch (error) {
				console.log(error);
			}
		} else {
			console.log(
				"-----------------------------------------------------------------------------------------------------------------------------"
			);
			console.log(
				`CALCULATED COLLECTION OFFER PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxOffer} FOR ${collectionSymbol}`
			);
			console.log(
				"-----------------------------------------------------------------------------------------------------------------------------"
			);
		}
	} else {
		if (secondTopOffer) {
			const secondBestPrice = secondTopOffer.price.amount;
			const outBidAmount = outBidMargin * CONVERSION_RATE;
			if (bestPrice - secondBestPrice > outBidAmount) {
				const bidPrice = secondBestPrice + outBidAmount;

				try {
					if (ourOffer) {
						const offerIds = [ourOffer.id];
						await cancelCollectionOffer(offerIds, publicKey, privateKey);
					}
				} catch (error) {
					console.log(error);
				}

				if (bidPrice <= maxOffer && bidPrice < floorPrice) {
					console.log(
						"-----------------------------------------------------------------------------------------------------------------------------"
					);
					console.log(
						`ADJUST OUR CURRENT COLLECTION OFFER ${bestPrice} TO ${bidPrice} FOR ${collectionSymbol}`
					);
					console.log(
						"-----------------------------------------------------------------------------------------------------------------------------"
					);
					try {
						await placeCollectionBid(
							bidPrice,
							expiration,
							collectionSymbol,
							buyerTokenReceiveAddress,
							publicKey,
							privateKey,
							feeSatsPerVbyte
						);
						bidHistory[collectionSymbol].offerType = "COLLECTION";
						bidHistory[collectionSymbol].highestCollectionOffer = {
							price: bidPrice,
							buyerPaymentAddress: buyerPaymentAddress,
						};
					} catch (error) {
						console.log(error);
					}
				} else {
					console.log(
						"-----------------------------------------------------------------------------------------------------------------------------"
					);
					console.log(
						`CALCULATED COLLECTION OFFER PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxOffer} FOR ${collectionSymbol}`
					);
					console.log(
						"-----------------------------------------------------------------------------------------------------------------------------"
					);
				}
			}
		} else {
			const bidPrice = minOffer;
			if (bestPrice !== bidPrice) {
				try {
					if (ourOffer) {
						const offerIds = [ourOffer.id];
						await cancelCollectionOffer(offerIds, publicKey, privateKey);
					}
				} catch (error) {
					console.log(error);
				}

				console.log(
					"-----------------------------------------------------------------------------------------------------------------------------"
				);
				console.log(
					`ADJUST OUR CURRENT COLLECTION OFFER ${bestPrice} TO ${bidPrice} FOR ${collectionSymbol} `
				);
				console.log(
					"-----------------------------------------------------------------------------------------------------------------------------"
				);

				if (bidPrice <= maxOffer && bidPrice < floorPrice) {
					try {
						await placeCollectionBid(
							bidPrice,
							expiration,
							collectionSymbol,
							buyerTokenReceiveAddress,
							publicKey,
							privateKey,
							feeSatsPerVbyte
						);
						bidHistory[collectionSymbol].offerType = "COLLECTION";
						bidHistory[collectionSymbol].highestCollectionOffer = {
							price: bidPrice,
							buyerPaymentAddress: buyerPaymentAddress,
						};
					} catch (error) {
						console.log(error);
					}
				} else {
					console.log(
						"-----------------------------------------------------------------------------------------------------------------------------"
					);
					console.log(
						`CALCULATED BID PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxOffer} FOR ${collectionSymbol}`
					);
					console.log(
						"-----------------------------------------------------------------------------------------------------------------------------"
					);
				}
			}
		}
	}
} else {
	const bidPrice = minOffer;
	if (bidPrice <= maxOffer && bidPrice < floorPrice) {
		await placeCollectionBid(
			bidPrice,
			expiration,
			collectionSymbol,
			buyerTokenReceiveAddress,
			publicKey,
			privateKey,
			feeSatsPerVbyte
		);
		bidHistory[collectionSymbol].offerType = "COLLECTION";

		bidHistory[collectionSymbol].highestCollectionOffer = {
			price: bidPrice,
			buyerPaymentAddress: buyerPaymentAddress,
		};
	}
}

const counterBidQueue = [];

if (isWsConnected) {
	ws.send(JSON.stringify(subscriptionMessage));
	ws.on("message", async (data) => {
		try {
			if (isValidJSON(data.toString())) {
				const message = JSON.parse(data.toString());

				// GET ONLY COLLECTION OFFERS

				if (message.kind === "coll_offer_created") {
					counterBidQueue.push(message);
					processCounterBidQueue(counterBidQueue);
				}

				async function processCounterBidQueue(counterBidQueue) {
					queue.addAll(
						counterBidQueue.map((offer) => async () => {
							const { listedPrice } = offer;

							// GET CURRENT HIGHEST COLLECTION OFFER DETAILS
							const currentHighestCollectionOfferPrice =
								bidHistory[collectionSymbol].highestCollectionOffer?.price;

							const ownerOfHighestOffer =
								bidHistory[collectionSymbol].highestCollectionOffer
									?.buyerPaymentAddress;

							// CHECK IF NEW COLLECTION OFFER PRICE IS GREATER THAN HIGHEST COLLECT OFFER

							if (!currentHighestCollectionOfferPrice) {
								// bid minimum
								const outBidMargin = item.outBidMargin ?? DEFAULT_OUTBID_MARGIN;
								const outBidAmount = outBidMargin * CONVERSION_RATE;
								const bidPrice = outBidAmount + Number(listedPrice);

								// BID
								await placeCollectionBid(
									bidPrice,
									expiration,
									collectionSymbol,
									buyerTokenReceiveAddress,
									publicKey,
									privateKey,
									feeSatsPerVbyte
								);
								bidHistory[collectionSymbol].offerType = "COLLECTION";

								// UPDATE RECORD
								bidHistory[collectionSymbol].highestCollectionOffer = {
									price: bidPrice,
									buyerPaymentAddress: buyerPaymentAddress,
								};
							} else if (
								currentHighestCollectionOfferPrice &&
								+listedPrice > currentHighestCollectionOfferPrice
							) {
								// IF WE DONE OWN THE INCOMING HIGHEST COLLECTION OFFER, OUTBID
								if (ownerOfHighestOffer !== buyerPaymentAddress) {
									const outBidMargin =
										item.outBidMargin ?? DEFAULT_OUTBID_MARGIN;
									const outBidAmount = outBidMargin * CONVERSION_RATE;
									const bidPrice = outBidAmount + Number(listedPrice);

									// OUTBID
									await placeCollectionBid(
										bidPrice,
										expiration,
										collectionSymbol,
										buyerTokenReceiveAddress,
										publicKey,
										privateKey,
										feeSatsPerVbyte
									);
									bidHistory[collectionSymbol].offerType = "COLLECTION";

									// UPDATE RECORD
									bidHistory[collectionSymbol].highestCollectionOffer = {
										price: bidPrice,
										buyerPaymentAddress: buyerPaymentAddress,
									};
								}
							}
						})
					);
				}
			}
		} catch (error) {}
	});
}
