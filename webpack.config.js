import path from "node:path";
import { fileURLToPath } from "node:url";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import { EsbuildPlugin } from "esbuild-loader";
import webpackPackage from "@cocreate/webpack";

const { FileUploader } = webpackPackage;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async (env, argv) => {
	const isProduction = argv && argv.mode === "production";
	const config = {
		entry: {
			"CoCreate-utils": "./src/browser.js"
		},
		output: {
			path: path.resolve(__dirname, "dist"),
			filename: isProduction ? "[name].min.js" : "[name].js",
			libraryExport: "default",
			library: ["CoCreate", "utils"],
			clean: true
		},
		plugins: [
			new MiniCssExtractPlugin({
				filename: isProduction ? "[name].min.css" : "[name].css"
			}),
			new FileUploader(env, argv)
		],
		mode: isProduction ? "production" : "development",
		devtool: isProduction ? "source-map" : "eval-source-map",
		module: {
			rules: [
				{
					test: /.js$/,
					exclude: /node_modules/,
					use: {
						loader: "esbuild-loader",
						options: {
							loader: "js",
							target: "es2017"
						}
					}
				},
				{
					test: /.css$/i,
					use: [MiniCssExtractPlugin.loader, "css-loader"]
				}
			]
		},
		optimization: {
			minimize: isProduction,
			minimizer: [
				new EsbuildPlugin({
					target: "es2017",
					minify: isProduction,
					css: true
				})
			],
			splitChunks: {
				cacheGroups: {
					defaultVendors: false
				}
			}
		},
		performance: {
			hints: isProduction ? "warning" : false
		}
	};
	return config;
};
