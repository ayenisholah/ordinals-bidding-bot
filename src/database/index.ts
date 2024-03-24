import { Sequelize } from 'sequelize';

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'src/database/database.sqlite',
});

export default sequelize;