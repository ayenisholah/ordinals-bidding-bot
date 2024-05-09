let counterBidQueue = [];
try {
	const subscriptionMessage = {
		type: "subscribeCollection",
		constraint: {
			chain: "bitcoin",
			collectionSymbol: item.collectionSymbol,
		},
	};

	if (isWsConnected) {
		ws.send(JSON.stringify(subscriptionMessage));
		ws.on(
			"message",
			async((data) => {
				if (isValidJSON(data.toString())) {
					const message = JSON.parse(data.toString());

					const tokenId = message.tokenId;
					if (
						message.kind === "offer_placed" &&
						ourBidsIds.includes(tokenId) &&
						message.buyerPaymentAddress !== buyerPaymentAddress
					) {
						if (
							!counterBidQueue.some((item) => item.tokenId === message.tokenId)
						) {
							counterBidQueue.push(message);
						}
						processCounterBidQueue(counterBidQueue);
					}
				}
			})
		);

		async function processCounterBidQueue(counterBidQueue) {
			const counterOffers = counterBidQueue.map((item) => ({
				listedPrice: item.listedPrice,
				tokenId: item.tokenId,
				buyerPaymentAddress: item.buyerPaymentAddress,
				createdAt: item.createdAt,
			}));
			console.log(
				"--------------------------------------------------------------------------"
			);
			console.log("COUNTER OFFERS FOUND VIA WEB SOCKET");
			console.table(counterOffers);
			console.log(
				"--------------------------------------------------------------------------"
			);

			queue.addAll(
				counterBidQueue.map((offer) => async () => {
					const { tokenId, listedPrice, buyerPaymentAddress } = offer;

					const bidPrice = +listedPrice + outBidMargin * CONVERSION_RATE;
					const ourBidPrice =
						bidHistory[collectionSymbol]?.ourBids[tokenId]?.price;
					const offerData = await getOffers(tokenId, buyerTokenReceiveAddress);
					if (offerData && offerData.offers && +offerData.total > 0) {
						const offer = offerData.offers[0];

						if (+listedPrice > ourBidPrice) {
							console.log(
								"-------------------------------------------------------------------------"
							);
							console.log("COUNTERBIDDING!!!!");
							console.log(
								"-------------------------------------------------------------------------"
							);

							try {
								await cancelBid(
									offer,
									privateKey,
									collectionSymbol,
									tokenId,
									buyerPaymentAddress
								);
								delete bidHistory[collectionSymbol].ourBids[tokenId];
								delete bidHistory[collectionSymbol].topBids[tokenId];
							} catch (error) {
								console.log(error);
							}
							if (bidPrice <= maxOffer) {
								try {
									const status = await placeBid(
										tokenId,
										bidPrice,
										expiration,
										buyerTokenReceiveAddress,
										buyerPaymentAddress,
										publicKey,
										privateKey
									);
									if (status === true) {
										bidHistory[collectionSymbol].topBids[tokenId] = true;
										bidHistory[collectionSymbol].ourBids[tokenId] = {
											price: bidPrice,
											expiration: expiration,
										};
									}
								} catch (error) {
									console.log(error);
								}
							} else {
								console.log(
									"-----------------------------------------------------------------------------------------------------------------------------"
								);
								console.log(
									`CALCULATED BID PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxOffer} FOR ${collectionSymbol} ${tokenId}`
								);
								console.log(
									"-----------------------------------------------------------------------------------------------------------------------------"
								);
								delete bidHistory[collectionSymbol].topBids[tokenId];
								delete bidHistory[collectionSymbol].ourBids[tokenId];
							}
						} else {
							console.log(
								"-----------------------------------------------------------------------------------------------------------------------------"
							);
							console.log(
								`YOU CURRENTLY HAVE THE HIGHEST OFFER ${ourBidPrice} FOR ${collectionSymbol} ${tokenId}`
							);
							console.log(
								"-----------------------------------------------------------------------------------------------------------------------------"
							);
						}
					}
					counterBidQueue = counterBidQueue.filter(
						(item) => item.tokenId !== tokenId
					);
				})
			);
		}
	}
} catch (error) {
	console.log(error);
}
