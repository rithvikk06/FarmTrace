import * as anchor from '@coral-xyz/anchor';

export interface Farmtrace {
  version: '0.1.0';
  name: 'farmtrace';
  instructions: [
    {
      name: 'generateDdsData';
      docs: [
        'Generate DDS (Due Diligence Statement) data for EUDR',
        'This compiles all required data for regulatory submission',
      ];
      accounts: [
        {
          name: 'harvestBatch';
          pda: {
            seeds: [
              { kind: 'const'; value: [104, 97, 114, 118, 101, 115, 116, 95, 98, 97, 116, 99, 104] };
              { kind: 'account'; path: 'harvestBatch.batchId' };
              { kind: 'account'; path: 'harvestBatch.farmer' };
            ];
          };
        },
        {
          name: 'farmPlot';
          pda: {
            seeds: [
              { kind: 'const'; value: [102, 97, 114, 109, 95, 112, 108, 111, 116] };
              { kind: 'account'; path: 'farmPlot.plotId' };
              { kind: 'account'; path: 'farmPlot.farmer' };
            ];
          };
        },
      ];
      args: [];
      returns: {
        defined: 'DDSReport';
      };
    },
    {
      name: 'registerFarmPlot';
      docs: [
        'Register a new farm plot with a hash of its geolocation data.',
        'This creates the foundational NFT for EUDR compliance.',
      ];
      accounts: [
        {
          name: 'farmPlot';
          writable: true;
          pda: {
            seeds: [
              { kind: 'const'; value: [102, 97, 114, 109, 95, 112, 108, 111, 116] };
              { kind: 'arg'; path: 'plotId' };
              { kind: 'account'; path: 'farmer' };
            ];
          };
        },
        {
          name: 'farmer';
          writable: true;
          signer: true;
        },
        {
          name: 'validator';
          docs: ['The authority that will be allowed to validate this farm plot.'];
        },
        {
          name: 'systemProgram';
          address: '11111111111111111111111111111111';
        },
      ];
      args: [
        {
          name: 'plotId';
          type: 'string';
        },
        {
          name: 'farmerName';
          type: 'string';
        },
        {
          name: 'location';
          type: 'string';
        },
        {
          name: 'polygonHash';
          type: 'string';
        },
        {
          name: 'areaHectares';
          type: 'f64';
        },
        {
          name: 'commodityType';
          type: {
            defined: 'CommodityType';
          };
        },
        {
          name: 'registrationTimestamp';
          type: 'i64';
        },
      ];
    },
    {
      name: 'registerHarvestBatch';
      docs: [
        'Register a harvest batch linked to a farm plot',
        'This creates the supply chain traceability token',
      ];
      accounts: [
        {
          name: 'harvestBatch';
          writable: true;
          pda: {
            seeds: [
              { kind: 'const'; value: [104, 97, 114, 118, 101, 115, 116, 95, 98, 97, 116, 99, 104] };
              { kind: 'arg'; path: 'batchId' };
              { kind: 'account'; path: 'farmer' };
            ];
          };
        },
        {
          name: 'farmPlot';
          pda: {
            seeds: [
              { kind: 'const'; value: [102, 97, 114, 109, 95, 112, 108, 111, 116] };
              { kind: 'account'; path: 'farmPlot.plotId' };
              { kind: 'account'; path: 'farmer' };
            ];
          };
        },
        {
          name: 'farmer';
          writable: true;
          signer: true;
        },
        {
          name: 'systemProgram';
          address: '11111111111111111111111111111111';
        },
      ];
      args: [
        {
          name: 'batchId';
          type: 'string';
        },
        {
          name: 'weightKg';
          type: 'u64';
        },
        {
          name: 'harvestTimestamp';
          type: 'i64';
        },
      ];
    },
    {
      name: 'updateBatchStatus';
      docs: ['Update batch status as it moves through supply chain', 'Tracks: Harvested → Processing → InTransit → Delivered'];
      accounts: [
        {
          name: 'harvestBatch';
          writable: true;
          pda: {
            seeds: [
              { kind: 'const'; value: [104, 97, 114, 118, 101, 115, 116, 95, 98, 97, 116, 99, 104] };
              { kind: 'account'; path: 'harvestBatch.batchId' };
              { kind: 'account'; path: 'authority' };
            ];
          };
        },
        {
          name: 'authority';
          writable: true;
          signer: true;
        },
      ];
      args: [
        {
          name: 'newStatus';
          type: {
            defined: 'BatchStatus';
          };
        },
        {
          name: 'destination';
          type: 'string';
        },
      ];
    },
    {
      name: 'validateFarmPlot';
      docs: ['Validates a farm plot after off-chain deforestation analysis.', 'Can only be called by the designated validator.'];
      accounts: [
        {
          name: 'farmPlot';
          writable: true;
          pda: {
            seeds: [
              { kind: 'const'; value: [102, 97, 114, 109, 95, 112, 108, 111, 116] };
              { kind: 'account'; path: 'farmPlot.plotId' };
              { kind: 'account'; path: 'farmPlot.farmer' };
            ];
          };
        },
        {
          name: 'validator';
          writable: true;
          signer: true;
          relations: ['farmPlot'];
        },
      ];
      args: [];
    },
  ];
  accounts: [
    {
      name: 'FarmPlot';
      discriminator: [40, 161, 15, 119, 239, 151, 240, 61];
    },
    {
      name: 'HarvestBatch';
      discriminator: [77, 207, 252, 164, 233, 174, 126, 159];
    },
  ];
  events: [
    {
      name: 'BatchStatusUpdated';
      discriminator: [68, 227, 137, 197, 172, 152, 59, 35];
    },
    {
      name: 'DDSReportGenerated';
      discriminator: [204, 145, 94, 18, 107, 64, 76, 59];
    },
    {
      name: 'FarmPlotRegistered';
      discriminator: [143, 197, 101, 74, 154, 122, 40, 100];
    },
    {
      name: 'FarmPlotValidated';
      discriminator: [19, 187, 56, 7, 70, 96, 128, 2];
    },
    {
      name: 'HarvestBatchRegistered';
      discriminator: [147, 21, 11, 119, 162, 133, 21, 204];
    },
  ];
  errors: [
    {
      code: 6000;
      name: 'NonCompliantFarm';
      msg: 'Farm is not compliant or has not been validated.';
    },
    {
      code: 6001;
      name: 'PlotIdTooLong';
      msg: 'Plot ID is too long (max 32 characters)';
    },
    {
      code: 6002;
      name: 'BatchIdTooLong';
      msg: 'Batch ID is too long (max 32 characters)';
    },
    {
      code: 6003;
      name: 'InvalidArea';
      msg: 'Invalid area (must be > 0)';
    },
    {
      code: 6004;
      name: 'InvalidWeight';
      msg: 'Invalid weight (must be > 0)';
    },
    {
      code: 6005;
      name: 'DestinationTooLong';
      msg: 'Destination string is too long';
    },
    {
      code: 6006;
      name: 'InvalidHash';
      msg: 'Invalid hash';
    },
  ];
  types: [
    {
      name: 'BatchStatus';
      type: {
        kind: 'enum';
        variants: [{ name: 'Harvested' }, { name: 'Processing' }, { name: 'InTransit' }, { name: 'Delivered' }];
      };
    },
    {
      name: 'BatchStatusUpdated';
      type: {
        kind: 'struct';
        fields: [
          { name: 'batchId'; type: 'string' },
          {
            name: 'newStatus';
            type: {
              defined: 'BatchStatus';
            };
          },
          { name: 'destination'; type: 'string' },
          { name: 'timestamp'; type: 'i64' },
        ];
      };
    },
    {
      name: 'CommodityType';
      type: {
        kind: 'enum';
        variants: [
          { name: 'Cocoa' },
          { name: 'Coffee' },
          { name: 'PalmOil' },
          { name: 'Soy' },
          { name: 'Cattle' },
          { name: 'Rubber' },
          { name: 'Timber' },
        ];
      };
    },
    {
      name: 'ComplianceStatus';
      type: {
        kind: 'enum';
        variants: [{ name: 'Compliant' }, { name: 'PendingReview' }, { name: 'NonCompliant' }];
      };
    },
    {
      name: 'DDSReport';
      type: {
        kind: 'struct';
        fields: [
          { name: 'batchId'; type: 'string' },
          { name: 'plotId'; type: 'string' },
          { name: 'farmer'; type: 'pubkey' },
          { name: 'polygonHash'; type: 'string' },
          {
            name: 'commodityType';
            type: {
              defined: 'CommodityType';
            };
          },
          { name: 'harvestTimestamp'; type: 'i64' },
          { name: 'weightKg'; type: 'u64' },
          { name: 'noDeforestationVerified'; type: 'bool' },
          { name: 'complianceScore'; type: 'u8' },
          { name: 'lastVerified'; type: 'i64' },
          { name: 'registrationTimestamp'; type: 'i64' },
        ];
      };
    },
    {
      name: 'DDSReportGenerated';
      type: {
        kind: 'struct';
        fields: [
          { name: 'batchId'; type: 'string' },
          { name: 'complianceScore'; type: 'u8' },
          { name: 'timestamp'; type: 'i64' },
        ];
      };
    },
    {
      name: 'DeforestationRisk';
      type: {
        kind: 'enum';
        variants: [{ name: 'Low' }, { name: 'Medium' }, { name: 'High' }];
      };
    },
    {
      name: 'FarmPlot';
      type: {
        kind: 'struct';
        fields: [
          { name: 'plotId'; type: 'string' },
          { name: 'farmer'; type: 'pubkey' },
          { name: 'farmerName'; type: 'string' },
          { name: 'location'; type: 'string' },
          { name: 'polygonHash'; type: 'string' },
          { name: 'areaHectares'; type: 'f64' },
          {
            name: 'commodityType';
            type: {
              defined: 'CommodityType';
            };
          },
          { name: 'registrationTimestamp'; type: 'i64' },
          {
            name: 'deforestationRisk';
            type: {
              defined: 'DeforestationRisk';
            };
          },
          { name: 'complianceScore'; type: 'u8' },
          { name: 'lastVerified'; type: 'i64' },
          { name: 'isActive'; type: 'bool' },
          { name: 'isValidated'; type: 'bool' },
          { name: 'validator'; type: 'pubkey' },
          { name: 'bump'; type: 'u8' },
        ];
      };
    },
    {
      name: 'FarmPlotRegistered';
      type: {
        kind: 'struct';
        fields: [
          { name: 'plotId'; type: 'string' },
          { name: 'farmer'; type: 'pubkey' },
          { name: 'polygonHash'; type: 'string' },
          { name: 'timestamp'; 'type': 'i64' },
        ];
      };
    },
    {
      name: 'FarmPlotValidated';
      type: {
        kind: 'struct';
        fields: [
          { name: 'plotId'; type: 'string' },
          { name: 'validator'; type: 'pubkey' },
          { name: 'timestamp'; type: 'i64' },
        ];
      };
    },
    {
      name: 'HarvestBatch';
      type: {
        kind: 'struct';
        fields: [
          { name: 'batchId'; type: 'string' },
          { name: 'farmPlot'; type: 'pubkey' },
          { name: 'farmer'; type: 'pubkey' },
          { name: 'weightKg'; type: 'u64' },
          { name: 'harvestTimestamp'; type: 'i64' },
          {
            name: 'commodityType';
            type: {
              defined: 'CommodityType';
            };
          },
          {
            name: 'status';
            type: {
              defined: 'BatchStatus';
            };
          },
          {
            name: 'complianceStatus';
            type: {
              defined: 'ComplianceStatus';
            };
          },
          { name: 'destination'; type: 'string' },
          { name: 'bump'; type: 'u8' },
        ];
      };
    },
    {
      name: 'HarvestBatchRegistered';
      type: {
        kind: 'struct';
        fields: [
          { name: 'batchId'; type: 'string' },
          { name: 'farmPlot'; type: 'pubkey' },
          { name: 'weightKg'; type: 'u64' },
          { name: 'timestamp'; type: 'i64' },
        ];
      };
    },
  ];
}