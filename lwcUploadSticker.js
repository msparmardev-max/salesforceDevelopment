import { LightningElement, api, wire, track } from 'lwc';
import createStickerBridge from '@salesforce/apex/realTimeController.createStickerBridge';
import getLabelsForConsumersLightning from '@salesforce/apex/LabelProvider.getLabelsForConsumersLightning';
import { CloseActionScreenEvent } from 'lightning/actions';


export default class lwcUploadSticker extends LightningElement {
    static renderMode = 'shadow';
    @api recordId;
    @track stickerName = '';
    @track selectedStream = '';
    @track valueStreamOptions = [];
    @track fileData = null;
    @track showSuccessCheck = false;
    @track showErrorMessage = false;
    @track errorMessage = '';
    @track isCompressing = false;
    @track isGlobal = false;
    isSaving = false;
    @track showCustomToastBox = false;
    @track toastMessage = '';
    @track toastTitle = '';
    @track toastVariant = 'success';
    @track toastIcon = 'utility:success';
    @track labels = {};
    @track labelsLoaded = false;

    connectedCallback() {
        this.valueStreamOptions = [{ label: '-- None (Global Sticker) --', value: '' }];
        if (this.recordId) {
            this.valueStreamOptions.push({ label: 'This Value Stream', value: this.recordId });
            this.selectedStream = this.recordId;
        }
    }

    handleNameChange(event) {
        this.stickerName = event.target.value;
        if (this.stickerName.length > 80) {
            this.stickerName = this.stickerName.substring(0, 80);
        }
    }

    get toastClass() {
        return `custom-toast ${this.toastVariant}`;
    }

    // NEW: dynamic global toggle class
    get globalToggleClass() {
        return this.isGlobal ? 'global-toggle active' : 'global-toggle';
    }

    // NEW: dynamic global toggle label (fix for HTML ? : expression)
    get globalToggleLabel() {
        return this.isGlobal ? ' Global Sticker' : ' This Value Stream Only';
    }

    // NEW: toggle logic to switch between global/local mode
    toggleGlobalSticker() {
        this.isGlobal = !this.isGlobal;
        this.selectedStream = this.isGlobal ? '' : this.recordId;

    }

    // NEW: used by new HTML to open file dialog when clicking Browse button or box
    triggerFileDialog() {
        const input = this.template.querySelector('input[type="file"]');
        if (input) input.click();
    }

    // NEW: dynamic filename display for UI
    get displayedFileName() {
        return this.fileData?.filename || this.lblNoFileChosen;
    }

    // handleFileChange() — same logic, added “cancel” and proper reset handling
    async handleFileChange(event) {
        const file = event.target.files[0];
        if (!file) {
            // If user cancels file selection
            this.fileData = null;
            return;
        }

        const maxSize = 20 * 1024; // Limit-20 KB
        if (file.size > maxSize) {
            this.showCustomToast('error', this.lblToastError, this.lblFileSizeExceed);
            this.fileData = null;
            event.target.value = '';
            return;
        }

        if (!file.type.startsWith('image/')) {
            this.showCustomToast('error', this.lblToastError, this.lblUploadImageOnly);

            this.fileData = null;
            event.target.value = '';
            return;
        }

        const readerOriginal = new FileReader();
        readerOriginal.onload = () => {
            const originalBase64 = readerOriginal.result.split(',')[1];

            this.fileData = {
                filename: file.name,
                base64: originalBase64,
                previewUrl: readerOriginal.result,
                contentType: file.type,
                originalSize: file.size,
                isOriginalUsed: true    // SAME SIZE
            };

        };

        readerOriginal.readAsDataURL(file);
        // STOP — DO NOT USE COMPRESSED VERSION
    }

    get saveButtonLabel() {
        if (this.isCompressing) return 'Processing...';
        return this.isSaving ? 'Uploading…' : 'Save Sticker';
    }

    async handleSave() {
        if (!this.stickerName) {
            this.showCustomToast('error', this.lblToastError, this.lblEnterName);
            return;
        }
        if (!this.fileData) {
            this.showCustomToast('error', this.lblToastError, this.lblSelectFile);
            return;
        }

        this.isSaving = true;
        this.showErrorMessage = false;
        this.showSuccessCheck = false;

        try {
            const stickerObj = [{
                Name: this.stickerName,
                Base64Body: this.fileData.base64,
                ContentType: this.fileData.contentType,
                AttachmentID: null,
                ContentDocumentId: null,
                Id: null
            }];

            const jsonString = JSON.stringify(stickerObj);
            const jsonSize = jsonString.length;

            await createStickerBridge({
                valueStreamId: this.selectedStream,
                jsonString: jsonString
            });

            this.showSuccessCheck = true;
            this.showCustomToast('success', this.lblToastSuccess, this.lblUploadSuccessfully);


            setTimeout(() => {
                this.dispatchEvent(new CloseActionScreenEvent());
                eval("$A.get('e.force:refreshView').fire();");
            }, 900);

            this.resetForm();
            setTimeout(() => { this.showSuccessCheck = false; }, 1500);

        } catch (error) {
            console.error(' Upload failed:', JSON.stringify(error));
            const errorMsg =
                error?.body?.message ||
                error?.message ||
                'Sticker upload failed. Please try again.';
            this.showCustomToast('error', this.lblToastError, errorMsg);
            this.errorMessage = errorMsg;
            this.showErrorMessage = true;
            setTimeout(() => { this.showErrorMessage = false; }, 5000);
        } finally {
            this.isSaving = false;
        }
    }

    resetForm() {
        this.stickerName = '';
        this.selectedStream = this.isGlobal ? '' : this.recordId || '';
        this.fileData = null;
        this.isGlobal = false;
        const fileInput = this.template.querySelector('input[type="file"], lightning-input[type="file"]');
        if (fileInput) fileInput.value = null;
    }
    //custom toast box methods
    showCustomToast(type, title, message) {
        this.toastVariant = type;  // success | error
        this.toastTitle = title;
        this.toastMessage = message;
        this.toastIcon = type === 'success' ? 'utility:success' : 'utility:error';

        this.showCustomToastBox = true;

        // Auto hide after 4 sec
        setTimeout(() => {
            this.showCustomToastBox = false;
        }, 4000);
    }

    closeToast() {
        this.showCustomToastBox = false;
    }

    get compressionRatio() {
        if (!this.fileData) return '';
        const sizeKB = Math.round(this.fileData.originalSize / 1024);
        return `${this.lblFileSize} : ${sizeKB} KB`;

    }
    @wire(getLabelsForConsumersLightning, { componentName: 'UploadSticker' })
    wiredLabels({ data, error }) {
        if (data) {
            console.log(' Labels from Apex:', data);
            this.labels = data;
            this.labelsLoaded = true;
        } else if (error) {
            console.error(' Error fetching labels:', error);
            this.labelsLoaded = true;
        }
    }
    get lblUploadSticker() { return this.labels?.UploadSticker || 'Upload Sticker'; }
    get lblStickerName() { return this.labels?.StickerName || 'Sticker Name'; }
    get lblEnterName() { return this.labels?.EnterName || 'Please enter the name'; }
    get lblGlobal() { return this.labels?.Global || 'Global'; }
    get lblBrowseFile() { return this.labels?.BrowseFile || 'Browse File'; }
    get lblCancel() { return this.labels?.Cancel || 'Cancel'; }
    get lblUpload() { return this.labels?.Upload || 'Upload'; }
    get lblNoFileChosen() { return this.labels?.NoFile || 'No file chosen'; }
    get lblToastError() { return this.labels?.Error || 'Error'; }
    get lblToastSuccess() { return this.labels?.Success || 'Success'; }
    get lblToastInfo() { return this.labels?.ToastInfo || 'Info'; }
    get lblSelectFile() { return this.labels?.SelectFileWarning || 'Please select a file to upload.'; }
    get lblUploadSuccessfully() { return this.labels?.UploadSuccessfully || 'Sticker uploaded successfully!'; }
    get lblUploadImageOnly() { return this.labels?.UploadImageOnly || 'Please upload an image file only.'; }
    get lblFileSizeExceed() { return this.labels?.FileSizeExceed || 'File size should not exceed 20 KB.'; }
    get lblFileSize() { return this.labels?.FileSize || 'File size'; }

}