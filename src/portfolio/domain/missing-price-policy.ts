import type { PortfolioPositionAccumulator } from './portfolio-position-accumulator';
import { PortfolioPosition } from '../ types/portfolio-position.type';

export interface MissingPricePolicy {
  buildPositionWithoutPrice(
    position: PortfolioPositionAccumulator,
  ): PortfolioPosition;
}
