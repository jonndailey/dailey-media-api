#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { glob } from 'glob';
import mime from 'mime-types';
import ProgressBar from 'progress';
import fs from 'fs';
import path from 'path';
import { DaileyMediaApi } from '@dailey/media-api-sdk';

interface Config {
  apiKey?: string;
  baseURL?: string;
  defaultBucket?: string;
}

class DaileyMediaCLI {
  private api: DaileyMediaApi;
  private config: Config = {};
  private configPath: string;

  constructor() {
    this.configPath = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.dmedia-config.json');
    this.loadConfig();
    
    this.api = new DaileyMediaApi({
      baseURL: this.config.baseURL || 'https://api.dailey.dev',
      apiKey: this.config.apiKey
    });
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        this.config = JSON.parse(configData);
      }
    } catch (error) {
      console.log(chalk.yellow('Warning: Could not load config file'));
    }
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      console.log(chalk.green('✓ Configuration saved'));
    } catch (error) {
      console.log(chalk.red('✗ Failed to save configuration'));
    }
  }

  async configure(): Promise<void> {
    console.log(chalk.blue('🔧 Dailey Media CLI Configuration'));
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'apiKey',
        message: 'API Key:',
        default: this.config.apiKey,
        validate: (input) => input.length > 0 || 'API Key is required'
      },
      {
        type: 'input',
        name: 'baseURL',
        message: 'API Base URL:',
        default: this.config.baseURL || 'https://api.dailey.dev'
      },
      {
        type: 'input',
        name: 'defaultBucket',
        message: 'Default Bucket (optional):',
        default: this.config.defaultBucket
      }
    ]);

    this.config = answers;
    this.saveConfig();

    // Test the configuration
    const spinner = ora('Testing API connection...').start();
    try {
      await this.api.health();
      spinner.succeed('API connection successful');
    } catch (error) {
      spinner.fail('API connection failed');
      console.log(chalk.red('Please check your configuration'));
    }
  }

  async uploadFiles(patterns: string[], options: any): Promise<void> {
    if (!this.config.apiKey) {
      console.log(chalk.red('✗ Please configure your API key first: dmedia config'));
      return;
    }

    // Expand file patterns
    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern, { nodir: true });
      files.push(...matches);
    }

    if (files.length === 0) {
      console.log(chalk.yellow('No files found matching the patterns'));
      return;
    }

    console.log(chalk.blue(`📤 Uploading ${files.length} file(s)...`));

    const bucket = options.bucket || this.config.defaultBucket;
    const folder = options.folder;
    const tags = options.tags ? options.tags.split(',') : undefined;

    const progressBar = new ProgressBar('[:bar] :current/:total :percent :file', {
      total: files.length,
      width: 40,
      complete: '█',
      incomplete: '░'
    });

    const results = [];

    for (const filePath of files) {
      try {
        const fileName = path.basename(filePath);
        const fileBuffer = fs.readFileSync(filePath);
        const mimeType = mime.lookup(filePath) || 'application/octet-stream';

        progressBar.tick({ file: fileName });

        const result = await this.api.uploadFile({
          file: fileBuffer,
          filename: fileName,
          bucket,
          folder,
          tags
        });

        results.push({
          file: fileName,
          id: result.id,
          size: result.file_size,
          url: result.accessUrl
        });

      } catch (error: any) {
        results.push({
          file: path.basename(filePath),
          error: error.message
        });
      }
    }

    console.log('\n' + chalk.green('✓ Upload completed'));
    
    // Display results
    console.log('\nResults:');
    results.forEach(result => {
      if (result.error) {
        console.log(chalk.red(`✗ ${result.file}: ${result.error}`));
      } else {
        console.log(chalk.green(`✓ ${result.file} (${result.id})`));
        if (options.verbose && result.url) {
          console.log(chalk.gray(`  URL: ${result.url}`));
        }
      }
    });
  }

  async listFiles(options: any): Promise<void> {
    if (!this.config.apiKey) {
      console.log(chalk.red('✗ Please configure your API key first: dmedia config'));
      return;
    }

    const spinner = ora('Fetching files...').start();
    
    try {
      const files = await this.api.listFiles(
        options.bucket || this.config.defaultBucket,
        options.folder
      );

      spinner.succeed(`Found ${files.length} file(s)`);

      if (files.length === 0) {
        console.log(chalk.yellow('No files found'));
        return;
      }

      console.log('\nFiles:');
      files.forEach(file => {
        const size = this.formatFileSize(file.file_size);
        const date = new Date(file.uploaded_at).toLocaleDateString();
        
        console.log(`📄 ${chalk.cyan(file.original_filename)} (${file.id})`);
        console.log(`   Size: ${size} | Type: ${file.mime_type} | Date: ${date}`);
        
        if (options.verbose) {
          console.log(`   Bucket: ${file.bucket_id} | Path: ${file.folder_path || '/'}`);
          if (file.accessUrl) {
            console.log(`   URL: ${file.accessUrl}`);
          }
        }
        console.log();
      });

    } catch (error: any) {
      spinner.fail('Failed to fetch files');
      console.log(chalk.red(error.message));
    }
  }

  async downloadFile(fileId: string, outputPath?: string): Promise<void> {
    if (!this.config.apiKey) {
      console.log(chalk.red('✗ Please configure your API key first: dmedia config'));
      return;
    }

    const spinner = ora('Fetching file information...').start();

    try {
      const file = await this.api.getFile(fileId);
      spinner.succeed('File information retrieved');

      if (!file.accessUrl) {
        console.log(chalk.red('✗ File access URL not available'));
        return;
      }

      const fileName = outputPath || file.original_filename;
      const downloadSpinner = ora(`Downloading ${fileName}...`).start();

      // Simple download implementation (in real implementation, use streaming)
      const response = await fetch(file.accessUrl);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      fs.writeFileSync(fileName, buffer);
      downloadSpinner.succeed(`Downloaded to ${fileName}`);

    } catch (error: any) {
      spinner.fail('Download failed');
      console.log(chalk.red(error.message));
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    if (!this.config.apiKey) {
      console.log(chalk.red('✗ Please configure your API key first: dmedia config'));
      return;
    }

    const confirm = await inquirer.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: `Are you sure you want to delete file ${fileId}?`,
      default: false
    }]);

    if (!confirm.proceed) {
      console.log(chalk.yellow('Delete cancelled'));
      return;
    }

    const spinner = ora('Deleting file...').start();

    try {
      await this.api.deleteFile(fileId);
      spinner.succeed('File deleted successfully');
    } catch (error: any) {
      spinner.fail('Delete failed');
      console.log(chalk.red(error.message));
    }
  }

  async listBuckets(): Promise<void> {
    if (!this.config.apiKey) {
      console.log(chalk.red('✗ Please configure your API key first: dmedia config'));
      return;
    }

    const spinner = ora('Fetching buckets...').start();

    try {
      const buckets = await this.api.listBuckets();
      spinner.succeed(`Found ${buckets.length} bucket(s)`);

      if (buckets.length === 0) {
        console.log(chalk.yellow('No buckets found'));
        return;
      }

      console.log('\nBuckets:');
      buckets.forEach(bucket => {
        const access = bucket.is_public ? '🌐 Public' : '🔒 Private';
        console.log(`📁 ${chalk.cyan(bucket.name)} (${bucket.id})`);
        console.log(`   ${access} | Files: ${bucket.file_count} | Created: ${new Date(bucket.created_at).toLocaleDateString()}`);
        if (bucket.description) {
          console.log(`   ${bucket.description}`);
        }
        console.log();
      });

    } catch (error: any) {
      spinner.fail('Failed to fetch buckets');
      console.log(chalk.red(error.message));
    }
  }

  async getAnalytics(): Promise<void> {
    if (!this.config.apiKey) {
      console.log(chalk.red('✗ Please configure your API key first: dmedia config'));
      return;
    }

    const spinner = ora('Fetching analytics...').start();

    try {
      const analytics = await this.api.getAnalytics();
      spinner.succeed('Analytics retrieved');

      console.log('\n📊 Analytics:');
      console.log(`Total Files: ${analytics.totalFiles || 0}`);
      console.log(`Total Storage: ${this.formatFileSize(analytics.totalStorage || 0)}`);
      console.log(`This Month: ${analytics.thisMonth || 0} uploads`);

    } catch (error: any) {
      spinner.fail('Failed to fetch analytics');
      console.log(chalk.red(error.message));
    }
  }

  private formatFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
}

// CLI Setup
const program = new Command();
const cli = new DaileyMediaCLI();

program
  .name('dmedia')
  .description('Dailey Media API CLI')
  .version('1.0.0');

program
  .command('config')
  .description('Configure API credentials and settings')
  .action(async () => {
    await cli.configure();
  });

program
  .command('upload <files...>')
  .description('Upload files to the API')
  .option('-b, --bucket <bucket>', 'Target bucket')
  .option('-f, --folder <folder>', 'Target folder')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('-v, --verbose', 'Verbose output')
  .action(async (files, options) => {
    await cli.uploadFiles(files, options);
  });

program
  .command('ls')
  .alias('list')
  .description('List files')
  .option('-b, --bucket <bucket>', 'Filter by bucket')
  .option('-f, --folder <folder>', 'Filter by folder')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    await cli.listFiles(options);
  });

program
  .command('download <fileId>')
  .description('Download a file')
  .option('-o, --output <path>', 'Output file path')
  .action(async (fileId, options) => {
    await cli.downloadFile(fileId, options.output);
  });

program
  .command('delete <fileId>')
  .alias('rm')
  .description('Delete a file')
  .action(async (fileId) => {
    await cli.deleteFile(fileId);
  });

program
  .command('buckets')
  .description('List all buckets')
  .action(async () => {
    await cli.listBuckets();
  });

program
  .command('analytics')
  .alias('stats')
  .description('Show analytics')
  .action(async () => {
    await cli.getAnalytics();
  });

// Error handling
program.on('command:*', function() {
  console.log(chalk.red('Unknown command: ' + program.args.join(' ')));
  console.log('Use --help for available commands');
  process.exit(1);
});

// Parse arguments
program.parse(process.argv);

// Show help if no arguments
if (!process.argv.slice(2).length) {
  program.outputHelp();
}