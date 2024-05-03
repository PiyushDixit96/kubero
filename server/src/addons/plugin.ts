import axios from 'axios';
import { KubernetesListObject, KubernetesObject } from '@kubernetes/client-node'

export interface IPluginFormFields {
    type: 'text' | 'number' |'switch' | 'select' | 'select-storageclass',
    label: string,
    name: string,
    required: boolean,
    options?: string[],
    default: string | number | boolean,
    description?: string,
}

export interface IPlugin {
    id: string
    enabled: boolean,
    beta: boolean,
    version: {
        latest: string,
        installed: string,
    },
    description: string,
    install: string,
    formfields: {[key: string]: IPluginFormFields},
    //crd: KubernetesObject,
    resourceDefinitions: any,
    artifact_url: string;
}

export abstract class Plugin {
    public plugin?: any;
    public id: string = ''; //same as operator name
    public enabled: boolean = false; // true if installed
    public version: {
        latest:string,
        installed: string
        } = {
            'latest': '0.0.0', // version fetched from artifacthub
            'installed': '0.0.0', // loaded if avialable from local operators
        };
    public displayName: string = '';
    public description: string = '';
    public maintainers: Object[] = [];
    public links: Object[] = [];
    public readme: string = '';
    //public crd: KubernetesObject = {}; // ExampleCRD which will be used as template
    protected additionalResourceDefinitions: Object = {};
    public resourceDefinitions: any = {}; // List of CRD to apply

    public artifact_url: string = ''; // Example: https://artifacthub.io/api/v1/packages/olm/community-operators/postgresql
    private artefact_data: any = {};
    private operator_data: any = {};
    public kind: string;

    constructor() {
        this.kind = this.constructor.name;
    }

    public async init(availableCRDs: any) {

        // load data from local Operators
        this.operator_data = this.loadOperatorData(availableCRDs);

        // load data from artifacthub
        await this.loadMetadataFromArtefacthub();

        // load CRD from artefacthub, or alterantively from local operator, as a fallback use the CRD from the plugin
        this.loadCRD();

        this.loadAdditionalResourceDefinitions();

        if (this.enabled) {
            console.log("✅ "+this.id, this.constructor.name)
            //console.log(this.resourceDefinitions) // debug CRD
        } else {
            console.log("❌ "+this.id, this.constructor.name)
        }


    }

    private async loadMetadataFromArtefacthub() {
        const response = await axios.get(this.artifact_url)
            .catch(error => {
                console.log('Warning: failed loading data from artifacthub for '+this.id)
                //console.log(error);
            }
        );

        // set artifact hub values
        if (response?.data && response.data.description) {
            //this.displayName = response?.data.displayName; // use the name from the plugin
            this.description = response.data.description;
            this.maintainers = response.data.maintainers;
            this.links = response.data.links;
            this.readme = response.data.readme;
            this.version.latest = response.data.version;
            this.artefact_data = response.data;
        } else {
            console.log("No artefact.io data found for "+this.id)
        }
        
    }

    private loadCRD() {
        if (this.resourceDefinitions[this.kind] !== undefined) {
            // CRD already loaded from operator
            return;
        }
        if (this.artefact_data.crds === undefined) {
            console.log("No CRDs defined in artefacthub for "+this.id)
            this.loadCRDFromOperatorData();
            return;
        } else {
            this.loadCRDFromArtefacthubData();
        }
    }

    private loadCRDFromArtefacthubData() {
        for (const artefactCRD of this.artefact_data.crds) {
            if (artefactCRD.kind === this.kind) {
                // search in artefact data for the crd
                let exampleCRD = this.artefact_data.crds_examples.find((crd: any) => crd.kind === artefactCRD.kind);

                this.resourceDefinitions[this.kind] = exampleCRD;

                //this.displayName = artefactCRD.displayName; // use the name from the plugin
                if (artefactCRD.description.length > this.description.length) {
                    this.description = artefactCRD.description; // use the description from the CRD
                }
                
                break;
            }
        }
    }

    private loadCRDFromOperatorData() {
        if (this.operator_data === undefined) {
            console.log("No CRDs defined in operator for "+this.id)
            return;
        }

        const operatorCRDList = this.operator_data.metadata.annotations['alm-examples'];

        if (operatorCRDList === undefined) {
            console.log("No CRDs defined in operator for "+this.id)
            return;
        }

        for (const op of JSON.parse(operatorCRDList)) {
            if (op.kind === this.constructor.name) {
                //this.crd = op;
                this.resourceDefinitions[op.kind] = op;
                break;
            }
        }
    }

    private loadOperatorData(availableOperators: any): any {
        for (const operatorCRD of availableOperators) {
            // console.log(operatorCRD.spec.names.kind, this.constructor.name) // debug CRD
            if (operatorCRD.spec.names.kind === this.constructor.name) {
                this.enabled = true;
                this.version.installed = operatorCRD.spec.version
                return operatorCRD;
            }
        }
        return undefined;
    }

    private loadAdditionalResourceDefinitions() {
        for (const [key, value] of Object.entries(this.additionalResourceDefinitions)) {
            this.resourceDefinitions[key] = value;
        }
    }
}