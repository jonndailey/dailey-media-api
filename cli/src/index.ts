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

  async listVideoPresets(): Promise<void> {
    if (!this.config.apiKey) {
      console.log(chalk.red('✗ Please configure your API key first: dmedia config'));
      return;
    }

    const spinner = ora('Fetching video presets...').start();

    try {
      const response = await this.api.listVideoPresets();
      spinner.succeed(`Found ${response.presets.length} preset(s)`);

      if (!response.presets.length) {
        console.log(chalk.yellow('No video presets configured on the server.'));
        return;
      }

      console.log('\n🎬 Video Presets:');
      response.presets.forEach(preset => {
        console.log(`• ${chalk.cyan(preset.id || `${preset.format}_${preset.videoCodec}`)}`);
        console.log(`   Format: ${preset.format} | Video: ${preset.videoCodec} | Audio: ${preset.audioCodec}`);
        if (preset.resolution) {
          console.log(`   Resolution: ${preset.resolution}`);
        }
        if (preset.bitrate) {
          console.log(`   Bitrate: ${preset.bitrate}`);
        }
        if (preset.audioBitrate) {
          console.log(`   Audio Bitrate: ${preset.audioBitrate}`);
        }
        console.log();
      });
    } catch (error: any) {
      spinner.fail('Failed to retrieve presets');
      console.log(chalk.red(error.message));
    }
  }

  async processVideo(mediaFileId: string, options: any): Promise<void> {
    if (!this.config.apiKey) {
      console.log(chalk.red('✗ Please configure your API key first: dmedia config'));
      return;
    }

    const outputs: any[] = [];

    if (options.preset) {
      const presets = Array.isArray(options.preset) ? options.preset : [options.preset];
      presets.forEach((preset: string) => {
        outputs.push({ preset });
      });
    }

    if (options.output) {
      const rawOutputs = Array.isArray(options.output) ? options.output : [options.output];
      for (const raw of rawOutputs) {
        try {
          const parsed = JSON.parse(raw);
          outputs.push(parsed);
        } catch (error) {
          console.log(chalk.red(`✗ Invalid JSON passed to --output: ${raw}`));
          return;
        }
      }
    }

    const payload: any = {};
    if (outputs.length) {
      payload.outputs = outputs;
    }

    if (options.webhook) {
      payload.webhookUrl = options.webhook;
    }

    const spinner = ora('Queuing video processing job...').start();

    try {
      const response = await this.api.processVideo(mediaFileId, payload);
      spinner.succeed('Video job queued');

      console.log('\nJob Information:');
      console.log(`ID: ${chalk.cyan(response.job.id)}`);
      console.log(`Media: ${response.job.mediaFileId}`);
      console.log(`Status: ${response.job.status}`);
      console.log(`Progress: ${response.job.progress}%`);
      if (response.job.outputs?.length) {
        console.log('Outputs:');
        response.job.outputs.forEach((output: any) => {
          if (output.preset) {
            console.log(`  • Preset: ${output.preset}`);
          } else {
            console.log(`  • ${output.format || 'custom'} (${output.videoCodec || 'codec'})`);
          }
        });
      }
      if (response.job.webhookUrl) {
        console.log(`Webhook: ${response.job.webhookUrl}`);
      }

      console.log('\nUse `dmedia video-job', chalk.cyan(response.job.id), '` or `dmedia video-jobs', mediaFileId, '` to monitor progress.');
    } catch (error: any) {
      spinner.fail('Failed to queue video job');
      console.log(chalk.red(error.message));
    }
  }

  async listVideoJobs(mediaFileId: string, options: any): Promise<void> {
    if (!this.config.apiKey) {
      console.log(chalk.red('✗ Please configure your API key first: dmedia config'));
      return;
    }

    const spinner = ora('Fetching video jobs...').start();

    try {
      const params: any = {};
      if (options.status) params.status = options.status;
      if (options.limit) params.limit = Number(options.limit);
      if (options.offset) params.offset = Number(options.offset);

      const response = await this.api.listVideoJobs(mediaFileId, params);
      spinner.succeed(`Found ${response.results.length} job(s)`);

      if (!response.results.length) {
        console.log(chalk.yellow('No processing jobs found for this media file.'));
        return;
      }

      response.results.forEach(job => {
        console.log(`• ${chalk.cyan(job.id)} | ${job.status} | ${job.progress ?? 0}%`);
        if (job.generated_outputs?.length) {
          console.log(`  Outputs: ${job.generated_outputs.map(output => `${output.format}/${output.videoCodec}`).join(', ')}`);
        }
        if (job.error_message) {
          console.log(chalk.red(`  Error: ${job.error_message}`));
        }
        console.log();
      });
    } catch (error: any) {
      spinner.fail('Failed to fetch video jobs');
      console.log(chalk.red(error.message));
    }
  }

  async getVideoJob(jobId: string): Promise<void> {
    if (!this.config.apiKey) {
      console.log(chalk.red('✗ Please configure your API key first: dmedia config'));
      return;
    }

    const spinner = ora('Fetching job details...').start();

    try {
      const response = await this.api.getVideoJob(jobId);
      spinner.succeed('Job retrieved');

      const job = response.job;
      console.log(`\nJob ${chalk.cyan(job.id)}`);
      console.log(`Media: ${job.media_file_id}`);
      console.log(`Status: ${job.status}`);
      console.log(`Progress: ${job.progress ?? 0}%`);
      if (job.error_message) {
        console.log(chalk.red(`Error: ${job.error_message}`));
      }

      if (job.generated_outputs?.length) {
        console.log('\nOutputs:');
        job.generated_outputs.forEach(output => {
          console.log(`  • ${output.format}/${output.videoCodec} (${this.formatFileSize(output.size || 0)})`);
          console.log(`    Storage Key: ${output.storageKey}`);
          if (output.url) {
            console.log(`    URL: ${output.url}`);
          }
          console.log();
        });
      }

      if (job.metadata?.source) {
        const source = job.metadata.source;
        console.log('\nSource Metadata:');
        if (source.duration) {
          console.log(`  Duration: ${source.duration}s`);
        }
        if (source.video) {
          console.log(`  Video: ${source.video.codec} ${source.video.width}x${source.video.height}`);
        }
        if (source.audio) {
          console.log(`  Audio: ${source.audio.codec || 'n/a'}`);
        }
      }
    } catch (error: any) {
      spinner.fail('Failed to retrieve job');
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
  .command('video-presets')
  .description('List available video processing presets')
  .action(async () => {
    await cli.listVideoPresets();
  });

program
  .command('video-process <mediaId>')
  .description('Queue a video for transcoding')
  .option('-p, --preset <preset...>', 'Preset ID(s) to use')
  .option('-o, --output <json...>', 'Custom output definition as JSON string')
  .option('-w, --webhook <url>', 'Webhook URL for completion/failure callbacks')
  .action(async (mediaId, options) => {
    await cli.processVideo(mediaId, options);
  });

program
  .command('video-jobs <mediaId>')
  .description('List video processing jobs for a media file')
  .option('-s, --status <status>', 'Filter by status (queued, processing, completed, failed, cancelled)')
  .option('-l, --limit <limit>', 'Limit number of jobs', (value) => parseInt(value, 10))
  .option('--offset <offset>', 'Offset for pagination', (value) => parseInt(value, 10))
  .action(async (mediaId, options) => {
    await cli.listVideoJobs(mediaId, options);
  });

program
  .command('video-job <jobId>')
  .description('Inspect a specific video processing job')
  .action(async (jobId) => {
    await cli.getVideoJob(jobId);
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
