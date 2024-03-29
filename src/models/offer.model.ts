import { Model, DataTypes } from 'sequelize';
import sequelize from '../database';

class Offer extends Model {
  public id!: string;
  public collectionSymbol!: string;
  public listedPrice!: number;
  public listedMakerFeeBp!: number;
  public offerDate!: string;
  public bestOffer!: number;
  public offerPrice!: number;
  public offerCreated!: boolean;
  public floorPrice!: number;
  public listed!: boolean;
  public listedAt!: string;
  public listingCreated!: boolean;
  public traits!: string;
  public counterbid!: boolean;
  public loop!: number;
  public buyerPaymentAddress!: string;
  public publicKey!: string;
  public active!: boolean;
}

Offer.init({
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false
  },
  collectionSymbol: {
    type: DataTypes.STRING,
    allowNull: false
  },
  listedPrice: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  listedMakerFeeBp: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  traits: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  offerDate: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  bestOffer: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  offerPrice: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  offerCreated: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  floorPrice: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  listed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  listedAt: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  listingCreated: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  counterbid: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  loop: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  buyerPaymentAddress: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  publicKey: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
}, {
  sequelize,
  modelName: 'Offer',
  timestamps: true,
  indexes: [
    {
      fields: ['id', 'collectionSymbol']
    }
  ]
});

export default Offer