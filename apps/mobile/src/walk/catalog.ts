import raw from './preparedWalk.json';
import { EditorialWalkSchema } from './model';

/** Generated from verified public graph geometry plus the sourced editorial revision. */
export function getPreparedWalk() { return EditorialWalkSchema.parse(raw); }
