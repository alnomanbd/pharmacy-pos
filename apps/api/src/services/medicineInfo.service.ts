import { Types } from 'mongoose';
import { MedicineGenericModel, MedicineModel, ShopProductModel } from '../models/index.js';
import { notFound } from '../utils/AppError.js';

/**
 * What a shop's product is, as a medicine: its catalogue entry and its
 * generic's write-up — what it is for, the dose, side effects, who should not
 * take it. For the pharmacist answering "can I take this with…?" at the
 * counter.
 *
 * Found through the product's catalogue link; a product added by hand with
 * only a generic name still finds its generic by that name. Nothing found is
 * an answer too (`null`), not an error.
 */
export async function productMedicineInfo(actor: { org: string | Types.ObjectId }, productId: string) {
  if (!Types.ObjectId.isValid(productId)) throw notFound('Product');
  const product = await ShopProductModel.findOne({ _id: productId, organization: actor.org })
    .select('medicine genericName')
    .lean<{ medicine?: Types.ObjectId | null; genericName?: string }>();
  if (!product) throw notFound('Product');

  const medicine = product.medicine
    ? await MedicineModel.findById(product.medicine)
        .select('brandName genericName generic strength dosageForm packSize price dar company')
        .populate('company', 'name')
        .lean()
    : null;

  const genericId = medicine?.generic;
  const generic = genericId
    ? await MedicineGenericModel.findById(genericId).select('name drugClass monograph monographSource').lean()
    : product.genericName?.trim()
      ? await MedicineGenericModel.findOne({ name: new RegExp(`^${product.genericName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
          .select('name drugClass monograph monographSource')
          .lean()
      : null;

  if (!medicine && !generic) return null;
  const sections = Object.entries((generic?.monograph ?? {}) as Record<string, string>).filter(([, v]) => v);
  return {
    medicine: medicine
      ? {
          brand: medicine.brandName,
          strength: medicine.strength ?? '',
          form: medicine.dosageForm ?? '',
          packSize: medicine.packSize ?? '',
          price: medicine.price ?? null,
          dar: medicine.dar ?? '',
          company: (medicine.company as { name?: string } | null)?.name ?? '',
        }
      : null,
    generic: generic
      ? {
          name: generic.name,
          drugClass: generic.drugClass ?? '',
          sections: Object.fromEntries(sections),
          source: generic.monographSource?.name ?? '',
        }
      : null,
  };
}
