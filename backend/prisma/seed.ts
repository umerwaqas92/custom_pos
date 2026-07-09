import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting seeding process...");

  // 1. Clean existing data
  await prisma.activityLog.deleteMany({});
  await prisma.supplierPayment.deleteMany({});
  await prisma.customerCreditPayment.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.stockMovement.deleteMany({});
  await prisma.warrantyClaim.deleteMany({});
  await prisma.saleItem.deleteMany({});
  await prisma.sale.deleteMany({});
  await prisma.repairJob.deleteMany({});
  await prisma.purchaseItem.deleteMany({});
  await prisma.purchaseOrder.deleteMany({});
  await prisma.branchStock.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.branch.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.brand.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.supplier.deleteMany({});

  // 2. Create Branches
  const showroom = await prisma.branch.create({
    data: {
      name: "Main Showroom",
      address: "123 Electronics Avenue, City Center",
      phone: "+1-555-0100"
    }
  });

  const warehouse = await prisma.branch.create({
    data: {
      name: "Central Warehouse",
      address: "45 Industrial Zone, Outer Suburb",
      phone: "+1-555-0200"
    }
  });

  console.log("Branches seeded.");

  // 3. Create Users
  const salt = await bcrypt.genSalt(10);
  const adminPassword = await bcrypt.hash("admin123", salt);
  const staffPassword = await bcrypt.hash("staff123", salt);

  const owner = await prisma.user.create({
    data: {
      name: "Owner John",
      username: "admin",
      passwordHash: adminPassword,
      role: "OWNER",
      email: "owner@electronics.com",
      phone: "+1-555-1111",
      branchId: showroom.id
    }
  });

  const manager = await prisma.user.create({
    data: {
      name: "Manager Sarah",
      username: "manager",
      passwordHash: staffPassword,
      role: "MANAGER",
      email: "manager@electronics.com",
      phone: "+1-555-2222",
      branchId: showroom.id
    }
  });

  const cashier = await prisma.user.create({
    data: {
      name: "Cashier Alice",
      username: "cashier",
      passwordHash: staffPassword,
      role: "CASHIER",
      email: "cashier@electronics.com",
      phone: "+1-555-3333",
      branchId: showroom.id
    }
  });

  const warehouseStaff = await prisma.user.create({
    data: {
      name: "Warehouse Bob",
      username: "warehouse",
      passwordHash: staffPassword,
      role: "WAREHOUSE",
      email: "warehouse@electronics.com",
      phone: "+1-555-4444",
      branchId: warehouse.id
    }
  });

  const technician = await prisma.user.create({
    data: {
      name: "Technician Dave",
      username: "tech",
      passwordHash: staffPassword,
      role: "TECHNICIAN",
      email: "tech@electronics.com",
      phone: "+1-555-5555",
      branchId: showroom.id
    }
  });

  console.log("Users seeded.");

  // 4. Create Categories
  const categoriesData = [
    "Smartphones", "Tablets", "Laptops", "Monitors", "TVs", "Accessories", "Gaming"
  ];
  const categoriesMap: { [key: string]: string } = {};
  for (const catName of categoriesData) {
    const cat = await prisma.category.create({ data: { name: catName } });
    categoriesMap[catName] = cat.id;
  }

  // 5. Create Brands
  const brandsData = [
    "Apple", "Samsung", "Xiaomi", "Dell", "HP", "Sony", "Lenovo"
  ];
  const brandsMap: { [key: string]: string } = {};
  for (const brandName of brandsData) {
    const br = await prisma.brand.create({ data: { name: brandName } });
    brandsMap[brandName] = br.id;
  }

  console.log("Categories and Brands seeded.");

  // 6. Create Suppliers
  const supplierA = await prisma.supplier.create({
    data: {
      company: "Apex Distributors",
      contactPerson: "Mark Apex",
      phone: "+1-555-6666",
      email: "orders@apexdistributors.com",
      address: "10 Wholesale Blvd"
    }
  });

  const supplierB = await prisma.supplier.create({
    data: {
      company: "Silicon Supply Co",
      contactPerson: "Jennifer Silicon",
      phone: "+1-555-7777",
      email: "sales@siliconsupply.com",
      address: "22 Chip Plaza"
    }
  });

  console.log("Suppliers seeded.");

  // 7. Create Customers
  const customer1 = await prisma.customer.create({
    data: {
      name: "Michael Green",
      phone: "5551234567",
      email: "michael@green.com",
      address: "99 Maple Lane",
      rewardPoints: 120,
      creditLimit: 1000.0,
      creditBalance: 150.0 // Has outstanding balance
    }
  });

  const customer2 = await prisma.customer.create({
    data: {
      name: "Emily White",
      phone: "5559876543",
      email: "emily@white.com",
      address: "42 Birch Circle",
      rewardPoints: 50,
      creditLimit: 500.0,
      creditBalance: 0.0
    }
  });

  console.log("Customers seeded.");

  // 8. Create Products
  const products = [
    {
      name: "iPhone 15 Pro Max",
      sku: "AP-IP15PM-256G",
      barcode: "190199000123",
      qrCode: "QR-IP15PM",
      categoryId: categoriesMap["Smartphones"],
      brandId: brandsMap["Apple"],
      model: "iPhone 15 Pro Max",
      color: "Titanium Gray",
      storage: "256GB",
      ram: "8GB",
      processor: "A17 Pro",
      warrantyMonths: 12,
      supplierId: supplierA.id,
      purchasePrice: 950.00,
      sellingPrice: 1199.00,
      wholesalePrice: 1050.00,
      taxRate: 8.0,
      discountRate: 0.0,
      images: JSON.stringify(["/placeholder_phone.jpg"]),
      description: "Latest flagship smartphone from Apple with Titanium design.",
      weight: 0.221,
      stockQuantity: 25,
      minStock: 5,
      type: "SINGLE"
    },
    {
      name: "Galaxy S24 Ultra",
      sku: "SM-S24U-512G",
      barcode: "880609000456",
      qrCode: "QR-S24U",
      categoryId: categoriesMap["Smartphones"],
      brandId: brandsMap["Samsung"],
      model: "Galaxy S24 Ultra",
      color: "Phantom Black",
      storage: "512GB",
      ram: "12GB",
      processor: "Snapdragon 8 Gen 3",
      warrantyMonths: 24,
      supplierId: supplierA.id,
      purchasePrice: 1000.00,
      sellingPrice: 1299.00,
      wholesalePrice: 1150.00,
      taxRate: 8.0,
      discountRate: 5.0, // 5% discount
      images: JSON.stringify(["/placeholder_galaxy.jpg"]),
      description: "AI-powered flagship smartphone from Samsung with S-Pen.",
      weight: 0.233,
      stockQuantity: 15,
      minStock: 3,
      type: "SINGLE"
    },
    {
      name: "Dell XPS 15 9530",
      sku: "DE-XPS15-I9-32G",
      barcode: "884116000789",
      qrCode: "QR-XPS15",
      categoryId: categoriesMap["Laptops"],
      brandId: brandsMap["Dell"],
      model: "XPS 15 9530",
      color: "Platinum Silver",
      storage: "1TB SSD",
      ram: "32GB",
      processor: "Intel Core i9-13900H",
      warrantyMonths: 12,
      supplierId: supplierB.id,
      purchasePrice: 1800.00,
      sellingPrice: 2299.00,
      wholesalePrice: 2000.00,
      taxRate: 10.0,
      discountRate: 0.0,
      images: JSON.stringify(["/placeholder_xps.jpg"]),
      description: "High-performance creator laptop with InfinityEdge display.",
      weight: 1.92,
      stockQuantity: 8,
      minStock: 2,
      type: "SINGLE"
    },
    {
      name: "Sony WH-1000XM5",
      sku: "SO-WH1000XM5-B",
      barcode: "454873000321",
      qrCode: "QR-XM5",
      categoryId: categoriesMap["Accessories"],
      brandId: brandsMap["Sony"],
      model: "WH-1000XM5",
      color: "Black",
      warrantyMonths: 12,
      supplierId: supplierA.id,
      purchasePrice: 250.00,
      sellingPrice: 399.00,
      wholesalePrice: 300.00,
      taxRate: 5.0,
      discountRate: 10.0, // 10% discount
      images: JSON.stringify(["/placeholder_xm5.jpg"]),
      description: "Industry-leading noise cancelling wireless headphones.",
      weight: 0.25,
      stockQuantity: 40,
      minStock: 10,
      type: "SINGLE"
    }
  ];

  for (const prodData of products) {
    const prod = await prisma.product.create({
      data: prodData
    });

    // Distribute stock quantities to branches
    const showroomQty = Math.floor(prodData.stockQuantity * 0.4);
    const warehouseQty = prodData.stockQuantity - showroomQty;

    await prisma.branchStock.create({
      data: {
        branchId: showroom.id,
        productId: prod.id,
        quantity: showroomQty
      }
    });

    await prisma.branchStock.create({
      data: {
        branchId: warehouse.id,
        productId: prod.id,
        quantity: warehouseQty
      }
    });

    // Create initial stock movements
    await prisma.stockMovement.create({
      data: {
        productId: prod.id,
        quantity: prodData.stockQuantity,
        type: "IN",
        branchId: warehouse.id,
        notes: "Initial inventory migration import"
      }
    });
  }

  console.log("Products and stocks seeded.");

  // 9. Add mock Expenses
  await prisma.expense.createMany({
    data: [
      {
        category: "RENT",
        amount: 2500.00,
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        description: "July Storefront Rent",
        paymentMethod: "BANK_TRANSFER"
      },
      {
        category: "UTILITIES",
        amount: 450.00,
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        description: "Electricity bill for June",
        paymentMethod: "CASH"
      }
    ]
  });

  // 10. Add sample Repair Job
  await prisma.repairJob.create({
    data: {
      deviceName: "MacBook Air M2",
      serialNumber: "FVFGH123ABCD",
      customerId: customer1.id,
      faultDescription: "Water damage, machine not power cycling.",
      technicianId: technician.id,
      status: "DIAGNOSING",
      repairCost: 0.0,
      serviceCharge: 150.0,
      notes: "Cleaned corrosion off logical board. Diagnostic test pending."
    }
  });

  console.log("Expenses and repairs seeded.");
  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error("Seeding failed: ", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
