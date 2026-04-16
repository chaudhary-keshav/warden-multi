import { z } from 'zod';
import { FixStatusSchema } from '../../types/index.js';
export { FixStatusSchema };
export const FixJudgeVerdictSchema = z.object({
    status: FixStatusSchema,
    reasoning: z.string(),
});
//# sourceMappingURL=types.js.map