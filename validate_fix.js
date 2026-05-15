import { rollGacha } from './js/gacha.js';
import { dataStore } from './js/data.js';

// Seed dataStore with minimal required structure for rollGacha/rollOne
dataStore.hamsters = [{ 
    id: 'test_hamster', 
    name: 'Test Hamster', 
    rarity: 'Legendary', 
    stars: 5,
    hp: 100,
    attack: 20,
    defense: 10,
    maxLevel: 100,
    signatureWeaponId: 'sig_test'
}];
dataStore.gacha.banners = [{
    id: 'test_banner',
    cost: { single: { cheese: 0 }, ten: { cheese: 0 } },
    pity: { fiveStarEvery: 90 },
    hamsterChance: 100,
    hamsterStars: { 5: 1 },
    rates: { 5: 1.0 },
    pool: { 5: ['test_hamster'] }
}];

const state = {
    gacha: { 
        selectedBannerId: 'test_banner',
        pity5: 89, // Force pity on next roll
        lastResults: []
    },
    resources: { cheese: 100 },
    hamsters: [],
    inventory: [],
    stats: { 
        gachaRolls: 0,
        gachaPulls: 0,
        fiveStarPulls: 0
    }
};

try {
    const results = rollGacha(state, 1);
    const hamster = state.hamsters[0];
    
    console.log('--- Hamster Validation ---');
    console.log('hp:', hamster.hp);
    console.log('attack:', hamster.attack);
    console.log('defense:', hamster.defense);
    console.log('maxLevel:', hamster.maxLevel);
    console.log('signatureWeaponId:', hamster.signatureWeaponId);
    console.log('equipmentSlots:', JSON.stringify(hamster.equipmentSlots));
    
    const slots = hamster.equipmentSlots || {};
    const expectedSlots = ['weapon', 'armor', 'backpack', 'tool', 'charm'];
    const allExpectedExist = expectedSlots.every(s => s in slots);
    const allNull = expectedSlots.every(s => slots[s] === null);
    
    console.log('Required fields exist:', (hamster.hp && hamster.attack && hamster.defense && hamster.maxLevel && hamster.signatureWeaponId) !== undefined);
    console.log('Equipment slots initialized to null:', allExpectedExist && allNull);
} catch (e) {
    console.error('Error during validation:', e);
    process.exit(1);
}
