import { describe, expect, it } from 'vitest';
import { genericKey, htmlToText } from '../src/seed/monographs.js';

describe('a monograph as text', () => {
  it('keeps the full text, lists as bullets, entities decoded, no markup', () => {
    const html =
      '<div class="ac-body"><div class="min-str-block"><div class="min-str" style="display:none">Short<span class="min-str-toggle">... Read more</span></div>' +
      '<div class="full-str">Tablet:<br>\n<ul>\n<li><strong>Adult</strong>: 1-2 tablets every 4&nbsp;to 6 hours.</li>\n<li><strong>Children</strong>: ½ to 1 tablet &amp; water.</li>\n</ul>\nRheumatic &amp; osteoarthritic pain.<script>x</script></div></div></div>';
    const text = htmlToText(html);
    expect(text).toBe('Tablet:\n• Adult: 1-2 tablets every 4 to 6 hours.\n• Children: ½ to 1 tablet & water.\n\nRheumatic & osteoarthritic pain.x');
    expect(text).not.toMatch(/[<>]/);
    expect(htmlToText('')).toBe('');
  });

  it('turns numeric entities and superscripts into characters', () => {
    expect(htmlToText('<p>10<sup>6</sup> &#181;g &#x2264; 5</p>')).toBe('10^6 µg ≤ 5');
  });
});

describe('a generic, however it is named', () => {
  it('ignores the salt, the order, the brackets and the spelling', () => {
    expect(genericKey('Ceftriaxone')).toBe(genericKey('Ceftriaxone Sodium'));
    expect(genericKey('Amoxicillin')).toBe(genericKey('Amoxicillin Trihydrate'));
    expect(genericKey('Cetirizine Dihydrochloride')).toBe(genericKey('Cetirizine Hydrochloride'));
    expect(genericKey('Caffeine + Paracetamol')).toBe(genericKey('Paracetamol + Caffeine'));
    expect(genericKey('Cholecalciferol (Vit. D3)')).toBe(genericKey('Vitamin D3'));
    expect(genericKey('Vitamin C')).toBe(genericKey('Ascorbic Acid'));
    expect(genericKey('Silver Sulphadiazine')).toBe(genericKey('Silver Sulfadiazine'));
    expect(genericKey('Zinc')).toBe(genericKey('Zinc Sulfate Monohydrate'));
  });

  it('keeps a mineral salt the medicine it is', () => {
    expect(genericKey('Calcium Carbonate')).not.toBe(genericKey('Calcium'));
    expect(genericKey('Sodium Chloride')).not.toBe(genericKey('Sodium'));
    expect(genericKey('Ferrous Sulphate')).not.toBe(genericKey('Ferrous Fumarate'));
  });
});
