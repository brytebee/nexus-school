import { describe, it, expect } from 'vitest';
import { validateClassArmRef } from '../../../private_engine/src/classArmValidator';

describe('Global Class & Arm Validator (validateClassArmRef)', () => {
    const classConfigs = ['JSS 1', 'JSS 2', 'Primary 1'];
    const classArms = [
        { hierarchy_class: 'JSS 1', arm: 'Gold' },
        { hierarchy_class: 'JSS 1', arm: 'Emerald' },
        { hierarchy_class: 'JSS 2', arm: 'Science' }
    ];

    describe('strict mode (Students & Teachers)', () => {
        it('accepts valid registered class + arm', () => {
            const res = validateClassArmRef('JSS 1 Gold', classConfigs, classArms, { mode: 'strict' });
            expect(res.ok).toBe(true);
            expect(res.resolved).toEqual({ class_name: 'JSS 1', class_arm: 'Gold' });
        });

        it('normalizes case and spacing while returning canonical DB values', () => {
            const res = validateClassArmRef('jss 1   emerald', classConfigs, classArms, { mode: 'strict' });
            expect(res.ok).toBe(true);
            expect(res.resolved).toEqual({ class_name: 'JSS 1', class_arm: 'Emerald' });
        });

        it('rejects unregistered arm on an armed class (e.g. JSS 1 A)', () => {
            const res = validateClassArmRef('JSS 1 A', classConfigs, classArms, { mode: 'strict' });
            expect(res.ok).toBe(false);
            expect(res.error).toContain('Arm "A" is not registered');
        });

        it('rejects missing arm on an armed class (e.g. bare JSS 1)', () => {
            const res = validateClassArmRef('JSS 1', classConfigs, classArms, { mode: 'strict' });
            expect(res.ok).toBe(false);
            expect(res.error).toContain('requires a designated arm');
        });

        it('accepts valid un-armed class (e.g. Primary 1)', () => {
            const res = validateClassArmRef('Primary 1', classConfigs, classArms, { mode: 'strict' });
            expect(res.ok).toBe(true);
            expect(res.resolved).toEqual({ class_name: 'Primary 1', class_arm: '' });
        });

        it('rejects arm specified on an un-armed class (e.g. Primary 1 Gold)', () => {
            const res = validateClassArmRef('Primary 1 Gold', classConfigs, classArms, { mode: 'strict' });
            expect(res.ok).toBe(false);
            expect(res.error).toContain('has no registered arms');
        });

        it('rejects non-existent base class', () => {
            const res = validateClassArmRef('SS 99 Gold', classConfigs, classArms, { mode: 'strict' });
            expect(res.ok).toBe(false);
            expect(res.error).toContain('is not registered in Class Manager');
        });
    });

    describe('fee_target mode (Fee Structures)', () => {
        it('accepts level-wide class name on an armed class (e.g. JSS 1 for all arms)', () => {
            const res = validateClassArmRef('JSS 1', classConfigs, classArms, { mode: 'fee_target' });
            expect(res.ok).toBe(true);
            expect(res.resolved).toEqual({ class_name: 'JSS 1', class_arm: '' });
        });

        it('accepts specific arm on an armed class (e.g. JSS 1 Gold)', () => {
            const res = validateClassArmRef('JSS 1 Gold', classConfigs, classArms, { mode: 'fee_target' });
            expect(res.ok).toBe(true);
            expect(res.resolved).toEqual({ class_name: 'JSS 1', class_arm: 'Gold' });
        });

        it('accepts "All Classes" wildcard', () => {
            const res = validateClassArmRef('All Classes', classConfigs, classArms, { mode: 'fee_target' });
            expect(res.ok).toBe(true);
            expect(res.resolved).toEqual({ class_name: null, class_arm: null });
        });

        it('rejects invalid arm in fee_target mode', () => {
            const res = validateClassArmRef('JSS 1 NonExistent', classConfigs, classArms, { mode: 'fee_target' });
            expect(res.ok).toBe(false);
            expect(res.error).toContain('is not registered');
        });
    });
});
